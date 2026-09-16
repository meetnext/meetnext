'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { ArrowLeft, Camera, CameraOff, Handshake, MessageCircle, Mic, MicOff, Phone, Send, ShieldCheck } from 'lucide-react'

const rtcConfig: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
type Status = 'connecting' | 'waiting' | 'connected' | 'disconnected'
type ChatMessage = { from: 'you' | 'guest' | 'system'; text: string; time: string }

export default function SessionPage() {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [cameraOn, setCameraOn] = useState(true)
  const [remoteVideoReady, setRemoteVideoReady] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    let active = true
    const socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL || window.location.origin, { transports: ['websocket', 'polling'], withCredentials: true })
    socketRef.current = socket
    const peer = new RTCPeerConnection(rtcConfig)
    peerRef.current = peer
    const remoteStream = new MediaStream()
    let remoteDescriptionSet = false
    const pendingCandidates: RTCIceCandidateInit[] = []

    const attachLocalStream = (stream: MediaStream) => {
      streamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    }
    peer.ontrack = ({ track }) => {
      if (!remoteStream.getTracks().some((current) => current.id === track.id)) remoteStream.addTrack(track)
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      if (track.kind === 'video') setRemoteVideoReady(true)
    }
    peer.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('ice-candidate', candidate.toJSON()) }
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'connected') setStatus('connected') }
    socket.on('connect', () => setStatus('waiting'))
    socket.on('connect_error', () => setStatus('disconnected'))
    socket.on('match-status', async ({ status: nextStatus, initiator }: { status: string; initiator?: boolean }) => {
      if (nextStatus === 'waiting') { setStatus('waiting'); setRemoteVideoReady(false); return }
      if (nextStatus !== 'matched') return
      setStatus('connected')
      if (initiator) { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); socket.emit('offer', peer.localDescription) }
    })
    socket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      await peer.setRemoteDescription(offer); remoteDescriptionSet = true
      await Promise.all(pendingCandidates.splice(0).map((candidate) => peer.addIceCandidate(candidate)))
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit('answer', peer.localDescription)
    })
    socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      await peer.setRemoteDescription(answer); remoteDescriptionSet = true
      await Promise.all(pendingCandidates.splice(0).map((candidate) => peer.addIceCandidate(candidate)))
    })
    socket.on('ice-candidate', async (candidate: RTCIceCandidateInit) => { if (remoteDescriptionSet) await peer.addIceCandidate(candidate).catch(() => undefined); else pendingCandidates.push(candidate) })
    socket.on('receive-message', (payload: { text: string; time?: string }) => setMessages((current) => [...current, { from: 'guest', text: payload.text, time: payload.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]))
    socket.on('partner-left', () => { setStatus('disconnected'); setRemoteVideoReady(false); if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null; setMessages((current) => [...current, { from: 'system', text: 'Your guest left the conversation.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]); peer.close() })

    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then((stream) => { if (!active) return stream.getTracks().forEach((track) => track.stop()); attachLocalStream(stream); socket.emit('find-match') }).catch(() => { setCameraOn(false); socket.emit('find-match') })
    return () => { active = false; socket.emit('leave-session'); socket.disconnect(); peer.close(); streamRef.current?.getTracks().forEach((track) => track.stop()) }
  }, [])

  const isConnected = status === 'connected'
  const statusText = status === 'waiting' || status === 'connecting' ? 'Looking for a guest' : isConnected ? 'You’re connected' : 'Guest disconnected'
  const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  function toggleTrack(kind: 'video' | 'audio') { const tracks = streamRef.current?.getTracks().filter((track) => track.kind === kind) ?? []; const enabled = tracks.length ? !tracks[0].enabled : false; tracks.forEach((track) => { track.enabled = enabled }); kind === 'video' ? setCameraOn(enabled) : setMicOn(enabled) }
  function sendMessage(event: FormEvent) { event.preventDefault(); const text = message.trim(); if (!text || !isConnected) return; socketRef.current?.emit('send-message', { text, time: time() }); setMessages((current) => [...current, { from: 'you', text, time: time() }]); setMessage('') }
  function nextMatch() {
    if (!socketRef.current) return
    setMessages([])
    setStatus('waiting')
    setRemoteVideoReady(false)
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    socketRef.current.emit('find_new_match')
    // Re-acquire media for new match
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then((stream) => {
      attachLocalStream(stream)
    }).catch(() => { setCameraOn(false) })
  }
  function leave() { socketRef.current?.emit('leave-session'); window.location.assign('/') }

  return <main className="relative flex h-screen max-h-screen flex-col overflow-hidden bg-[#f5efe3] text-[#302b25]">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(215,178,116,0.22),transparent_42%),linear-gradient(135deg,#fbf5e9,#eee2cf)]" />
    <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 lg:px-10"><div className="flex items-center gap-5"><a href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-[#d88963] text-[#fffaf3] shadow-lg shadow-[#d88963]/25"><Handshake className="size-5" /></span><span className="text-xl font-semibold tracking-[-0.04em]">meet<span className="text-[#c56f4c]">next</span></span></a><div><p className="text-base font-medium sm:text-lg">{statusText}</p><p className="hidden text-sm text-[#817666] sm:block">{isConnected ? 'Your next conversation starts here.' : 'We’ll show your guest here when they arrive.'}</p></div></div><div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-[#6f6558] sm:flex"><ShieldCheck className="size-4 text-[#61dbe4]" /> Safe, moderated space</div></header>
    <section className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-2 overflow-hidden px-3 pb-2 sm:gap-3 sm:px-6 lg:px-10"><div className="relative min-h-0 flex-1 md:grid md:grid-cols-2 md:gap-3"><VideoTile label="Guest" videoRef={remoteVideoRef} cameraOn={remoteVideoReady} fallback={status === 'disconnected' ? 'Guest disconnected' : 'We’ll show your guest here when they arrive.'} className="h-full" /><VideoTile label="You" muted videoRef={localVideoRef} cameraOn={cameraOn} fallback="Camera off" className="absolute right-3 top-3 z-10 h-32 w-48 shadow-2xl md:static md:h-full md:w-auto md:shadow-[0_12px_30px_rgba(91,69,40,0.16)]" /></div>
      <aside className="flex h-[28vh] min-h-[150px] shrink-0 flex-col rounded-2xl bg-[#f1e8d9] p-3 sm:h-[24vh] sm:min-h-[170px] sm:p-4"><div className="flex shrink-0 items-center gap-2 border-b border-white/10 pb-2"><div className="grid size-8 place-items-center rounded-lg bg-[#d88963]/10 text-[#c56f4c]"><MessageCircle className="size-4" /></div><div><h2 className="text-sm font-medium sm:text-base">Chat with your match</h2><p className="text-[11px] text-[#817666]">{isConnected ? 'Keep it kind and curious' : 'Chat opens when you match'}</p></div></div><div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2">{messages.length === 0 && <div className="rounded-xl bg-white/50 px-3 py-2 text-xs text-[#6f6558]">{isConnected ? 'You’re connected. Say hello when you’re ready.' : 'No guest connected yet.'}</div>}{messages.map((item, index) => <div key={`${item.text}-${index}`} className={item.from === 'you' ? 'ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-[#d88963] px-3 py-1.5 text-xs text-[#fffaf3]' : 'max-w-[88%] rounded-xl rounded-bl-sm bg-white/50 px-3 py-1.5 text-xs text-[#6f6558]'}><span className="mr-2 font-semibold">{item.from === 'you' ? 'You' : item.from === 'guest' ? 'Guest' : 'System'}</span>{item.text}<time className="ml-2 opacity-60">{item.time}</time></div>)}</div><form onSubmit={sendMessage} className="flex shrink-0 items-center gap-2 rounded-xl border border-[#6c5b43]/20 bg-white/70 p-1.5"><input disabled={!isConnected} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={isConnected ? 'Write a message...' : 'Waiting for a guest...'} aria-label="Write a message" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[#817666]" /><button disabled={!isConnected} aria-label="Send message" className="grid size-8 place-items-center rounded-lg bg-[#d88963] text-[#fffaf3] disabled:opacity-40"><Send className="size-4" /></button></form></aside>
      <div className="flex shrink-0 items-center justify-center gap-2 pb-1"><button onClick={() => toggleTrack('audio')} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} className="grid size-9 place-items-center rounded-full border border-[#6c5b43]/15 bg-white/60 text-[#6f6558]">{micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}</button><button onClick={() => toggleTrack('video')} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} className="grid size-9 place-items-center rounded-full border border-[#6c5b43]/15 bg-white/60 text-[#6f6558]">{cameraOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}</button><button onClick={nextMatch} disabled={!isConnected} className="rounded-full bg-[#d88963] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Next match</button><button onClick={leave} aria-label="Leave session" className="grid size-9 place-items-center rounded-full bg-[#302b25] text-white"><ArrowLeft className="size-4" /></button></div>
    </section>
  </main>
}

function VideoTile({ label, muted = false, videoRef, cameraOn, fallback, className = '' }: { label: string; muted?: boolean; videoRef: React.RefObject<HTMLVideoElement | null>; cameraOn: boolean; fallback: string; className?: string }) {
  return <div className={`relative min-h-0 overflow-hidden rounded-[28px] border border-white/50 bg-[#101827] shadow-[0_12px_30px_rgba(91,69,40,0.16)] ${className}`}><video ref={videoRef} autoPlay muted={muted} playsInline className={`size-full object-cover transition-opacity ${muted ? 'scale-x-[-1]' : ''} ${cameraOn ? 'opacity-100' : 'opacity-0'}`} /><div className={`absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(255,231,183,0.5),transparent_42%),linear-gradient(135deg,#c9b18b,#716657)] p-4 text-center transition-opacity ${cameraOn ? 'pointer-events-none opacity-0' : 'opacity-100'}`}><div><Handshake className="mx-auto mb-3 size-10 text-[#c56f4c]" /><p className="text-base font-medium text-[#302b25]">{fallback}</p><p className="mt-1 text-xs text-[#817666]">We’ll show your guest here when they arrive.</p></div></div><span className="absolute left-4 top-4 z-20 rounded-full bg-black/35 px-3 py-1 text-xs text-white shadow-sm backdrop-blur">{label}</span></div>
}
