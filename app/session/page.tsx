'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { ArrowLeft, Camera, CameraOff, Handshake, MessageCircle, Mic, MicOff, Phone, Send, ShieldCheck, Volume2 } from 'lucide-react'

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

type ChatMessage = { from: 'system' | 'you' | 'guest'; text: string }

export default function SessionPage() {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'connected' | 'disconnected'>('connecting')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    let active = true
    const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || window.location.origin
    const socket = io(signalingUrl, { transports: ['websocket', 'polling'], withCredentials: true })
    socketRef.current = socket
    const peer = new RTCPeerConnection(rtcConfig)
    peerRef.current = peer
    const remoteStream = new MediaStream()
    const pendingCandidates: RTCIceCandidateInit[] = []
    let remoteDescriptionSet = false
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream

    peer.onicecandidate = (event) => { if (event.candidate) socket.emit('ice-candidate', event.candidate.toJSON()) }
    peer.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((current) => current.id === track.id)) remoteStream.addTrack(track)
      })
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setStatus('connected')
      if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) setStatus('disconnected')
    }
    socket.on('connect', () => setStatus('waiting'))
    socket.on('connect_error', () => setStatus('disconnected'))
    socket.on('match-status', async ({ status: nextStatus, initiator }: { status: string; initiator?: boolean }) => {
      if (nextStatus !== 'matched') return
      setStatus('waiting')
      if (initiator) {
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        socket.emit('offer', peer.localDescription)
      }
    })
    socket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      await peer.setRemoteDescription(offer)
      remoteDescriptionSet = true
      await Promise.all(pendingCandidates.splice(0).map((candidate) => peer.addIceCandidate(candidate)))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      socket.emit('answer', peer.localDescription)
    })
    socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      await peer.setRemoteDescription(answer)
      remoteDescriptionSet = true
      await Promise.all(pendingCandidates.splice(0).map((candidate) => peer.addIceCandidate(candidate)))
    })
    socket.on('ice-candidate', async (candidate: RTCIceCandidateInit) => {
      if (!remoteDescriptionSet) pendingCandidates.push(candidate)
      else await peer.addIceCandidate(candidate).catch(() => undefined)
    })
    socket.on('chat-message', (text: string) => setMessages((current) => [...current, { from: 'guest', text }]))
    socket.on('partner-left', () => { setStatus('disconnected'); setMessages((current) => [...current, { from: 'system', text: 'Your guest left the conversation.' }]); peer.close() })

    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then((nextStream) => {
      if (!active) return nextStream.getTracks().forEach((track) => track.stop())
      streamRef.current = nextStream
      if (localVideoRef.current) localVideoRef.current.srcObject = nextStream
      if (pipVideoRef.current) pipVideoRef.current.srcObject = nextStream
      nextStream.getTracks().forEach((track) => peer.addTrack(track, nextStream))
      socket.emit('find-match')
    }).catch(() => { setCameraOn(false); socket.emit('find-match') })

    return () => { active = false; socket.emit('leave-session'); socket.disconnect(); peer.close(); streamRef.current?.getTracks().forEach((track) => track.stop()); if (localVideoRef.current) localVideoRef.current.srcObject = null; if (pipVideoRef.current) pipVideoRef.current.srcObject = null; if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null }
  }, [])

  function toggleTrack(kind: 'video' | 'audio') {
    const tracks = streamRef.current?.getTracks().filter((track) => track.kind === kind) ?? []
    const enabled = tracks.length ? !tracks[0].enabled : false
    tracks.forEach((track) => { track.enabled = enabled })
    if (kind === 'video') setCameraOn(enabled); else setMicOn(enabled)
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || status !== 'connected') return
    setMessages((current) => [...current, { from: 'you', text: trimmed }])
    socketRef.current?.emit('chat-message', trimmed)
    setMessage('')
  }

  function leave() { socketRef.current?.emit('leave-session'); window.location.assign('/') }
  
  function handleNext() {
      // Gracefully terminate current peer connection
      peerRef.current?.close()
      peerRef.current = null

      // Create new peer connection
      const newPeer = new RTCPeerConnection(rtcConfig)
      peerRef.current = newPeer

      // Re-add local tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          newPeer.addTrack(track, streamRef.current!)
        })
      }

      // Set up event handlers again
      const remoteStream = new MediaStream()
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current
      if (pipVideoRef.current) pipVideoRef.current.srcObject = streamRef.current

      newPeer.onicecandidate = (event) => {
        if (event.candidate) socketRef.current?.emit('ice-candidate', event.candidate.toJSON())
      }
      newPeer.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          if (!remoteStream.getTracks().some((current) => current.id === track.id)) {
            remoteStream.addTrack(track)
          }
        })
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      }
      newPeer.onconnectionstatechange = () => {
        if (newPeer.connectionState === 'connected') setStatus('connected')
        if (['failed', 'disconnected', 'closed'].includes(newPeer.connectionState)) setStatus('disconnected')
      }

      // Signal for new match
      socketRef.current?.emit('find_new_match')
      setStatus('waiting')
    }
  
  function handleStop() {
      // Terminate peer connection
      peerRef.current?.close()
      peerRef.current = null

      // Close all local media tracks
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null

      // Clear video elements
      if (localVideoRef.current) localVideoRef.current.srcObject = null
      if (pipVideoRef.current) pipVideoRef.current.srcObject = null
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null

      // Signal leave session
      socketRef.current?.emit('leave-session')

      // Update UI to idle state
      setStatus('disconnected')
      setCameraOn(false)
      setMicOn(false)
    }

  const isConnected = status === 'connected'
  const statusText = status === 'waiting' || status === 'connecting' ? 'Looking for a guest' : isConnected ? 'You’re connected' : 'Guest disconnected'

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5efe3] text-[#302b25]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(215,178,116,0.22),transparent_42%),linear-gradient(135deg,#fbf5e9,#eee2cf)]" />
      <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-10"><a href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-[#d88963] text-[#fffaf3] shadow-lg shadow-[#d88963]/25"><Handshake className="size-5" /></span><span className="text-xl font-semibold tracking-[-0.04em]">meet<span className="text-[#c56f4c]">next</span></span></a><div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-[#6f6558]"><ShieldCheck className="size-4 text-[#61dbe4]" /> Safe, moderated space</div></header>
      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-[1500px] flex-col justify-start px-3 pb-4 pt-3 sm:px-6 lg:justify-center lg:px-10"><div className="mb-5 flex items-center justify-between"><div><p className="text-lg font-medium">{statusText}</p><p className="mt-1 text-sm text-[#817666]">{isConnected ? 'Your next conversation starts here.' : 'We’ll show your guest here when they arrive.'}</p></div><button onClick={leave} className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-[#6f6558] transition hover:bg-white/10"><ArrowLeft className="size-4" /> Leave</button></div>
        <div className="relative overflow-hidden rounded-[30px] border border-[#6c5b43]/15 bg-[#fffaf0]/90 p-2 shadow-[0_24px_80px_rgba(91,69,40,0.16)] backdrop-blur-md sm:p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.8fr)]">
            <div className="relative aspect-[4/3] min-h-[300px] overflow-hidden rounded-[23px] bg-[#e6d8c2] sm:min-h-[480px] lg:aspect-[16/10] lg:min-h-[clamp(520px,62vh,760px)]">
              {isConnected ? (
                              <div className="video-grid">
                                <video ref={remoteVideoRef} autoPlay playsInline className="object-cover" />
                                <video ref={localVideoRef} autoPlay muted playsInline className={`object-cover ${cameraOn ? '' : 'opacity-0'}`} />
                              </div>
                            ) : (
                              <>
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,231,183,0.55),transparent_42%),linear-gradient(135deg,#c9b18b,#716657)]">
                                  <div className="absolute inset-0 grid place-items-center px-6">
                                    <div className="max-w-sm text-center">
                                      <div className="mx-auto mb-5 grid size-20 place-items-center rounded-[26px] border border-[#d88963]/25 bg-[#d88963]/10 text-[#c56f4c]">
                                        <Handshake className="size-9" />
                                      </div>
                                      <p className="text-xl font-medium">No guest connected</p>
                                      <p className="mt-2 text-sm leading-6 text-[#817666]">We'll show the guest camera here as soon as someone joins.</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="absolute bottom-4 right-4 h-[27%] min-h-24 w-[25%] min-w-32 overflow-hidden rounded-2xl border border-white/25 bg-[#101827] shadow-xl">
                                  <video ref={pipVideoRef} autoPlay muted playsInline className={`size-full object-cover ${cameraOn ? '' : 'opacity-0'}`} />
                                  {!cameraOn && <div className="absolute inset-0 grid place-items-center text-xs text-[#817666]"><CameraOff className="mb-1 size-5" /> Camera off</div>}
                                  <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-[10px] text-white/80">You</span>
                                </div>
                              </>
                            )}
                            {isConnected && (
                                            <div className="pip-overlay">
                                              <video ref={pipVideoRef} autoPlay muted playsInline className={`size-full object-cover ${cameraOn ? '' : 'opacity-0'}`} />
                                              {!cameraOn && <div className="absolute inset-0 grid place-items-center text-xs text-[#817666]"><CameraOff className="mb-1 size-5" /> Camera off</div>}
                                              <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-[10px] text-white/80">You</span>
                                            </div>
                                          )}
              <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">
                {isConnected ? 'Guest' : 'Waiting room'}
              </div>
            </div>
          <aside className="flex min-h-[300px] flex-col rounded-[23px] bg-[#f1e8d9] p-4 sm:min-h-[460px] sm:p-5 lg:min-h-[clamp(460px,62vh,760px)]"><div className="flex items-center gap-3 border-b border-white/10 pb-4"><div className="grid size-10 place-items-center rounded-xl bg-[#d88963]/10 text-[#c56f4c]"><MessageCircle className="size-5" /></div><div><h2 className="font-medium">Chat with your match</h2><p className="text-xs text-[#817666]">{isConnected ? 'Keep it kind and curious' : 'Chat opens when you match'}</p></div></div><div className="flex flex-1 flex-col gap-3 overflow-y-auto py-5">{messages.length === 0 && <div className="rounded-2xl bg-white/50 px-3 py-2 text-sm text-[#6f6558]">{isConnected ? 'You’re connected. Say hello when you’re ready.' : 'No guest connected yet.'}</div>}{messages.map((item, index) => <div key={`${item.text}-${index}`} className={item.from === 'you' ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#d88963] px-3 py-2 text-sm text-[#fffaf3]' : 'max-w-[88%] rounded-2xl rounded-bl-md bg-white/50 px-3 py-2 text-sm text-[#6f6558]'}>{item.text}</div>)}</div><form onSubmit={sendMessage} className="flex items-center gap-2 rounded-xl border border-[#6c5b43]/20 bg-white/70 p-2 shadow-sm"><input disabled={!isConnected} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={isConnected ? 'Write a message...' : 'Waiting for a guest...'} aria-label="Write a message" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#302b25] outline-none placeholder:text-[#817666]" /><button disabled={!isConnected} aria-label="Send message" className="grid size-9 place-items-center rounded-lg bg-[#d88963] text-[#fffaf3] transition hover:bg-[#c56f4c] disabled:cursor-not-allowed disabled:opacity-40"><Send className="size-4" /></button></form></aside></div><div className="flex items-center justify-center gap-3 py-4"><button onClick={handleStop} aria-label="Stop session" className="grid size-12 place-items-center rounded-full bg-[#d88963] transition hover:bg-[#c56f4c]"><Phone className="size-5 rotate-[135deg]" /></button><button onClick={handleNext} aria-label="Next match" className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/10 transition hover:bg-white/15"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-skip-forward size-5" aria-hidden="true"><polygon points="5 4 15 12 5 20"></polygon><line x1="19" y1="4" x2="19" y2="20"></line></svg></button><button onClick={() => toggleTrack('audio')} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/10 transition hover:bg-white/15">{micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}</button><button onClick={() => toggleTrack('video')} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/10 transition hover:bg-white/15">{cameraOn ? <Camera className="size-5" /> : <CameraOff className="size-5" />}</button><button onClick={leave} aria-label="End call" className="grid size-12 place-items-center rounded-full bg-[#d88963] transition hover:bg-[#c56f4c]"><Phone className="size-5 rotate-[135deg]" /></button><button aria-label="Toggle speaker" className="grid size-12 place-items-center rounded-full border border-white/10 bg-white/10 transition hover:bg-white/15"><Volume2 className="size-5" /></button></div></div>
      </section>
    </main>
  )
}
