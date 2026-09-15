'use client'

import { useState } from 'react'
import { ArrowRight, Handshake, ShieldCheck, Zap } from 'lucide-react'

export default function Page() {
  const [isMatching, setIsMatching] = useState(false)

  function findMatch() {
    setIsMatching(true)
    window.setTimeout(() => window.location.assign('/session'), 650)
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#f7f1e8] text-[#342d28]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(211,146,107,0.16),transparent_38%),radial-gradient(circle_at_10%_100%,rgba(119,158,142,0.12),transparent_35%)]" />
      <nav className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
        <a href="/" className="flex items-center gap-3" aria-label="MeetNext home">
          <span className="grid size-10 place-items-center rounded-[14px] bg-[#d88963] text-[#fffaf3] shadow-lg shadow-[#d88963]/25"><Handshake className="size-5" /></span>
          <span className="text-xl font-semibold tracking-[-0.05em]">meet<span className="text-[#c56f4c]">next</span></span>
        </a>
        <div className="flex items-center gap-2 text-xs font-medium text-[#776b5f]"><ShieldCheck className="size-4 text-[#6d9b8e]" /> Safe, moderated space</div>
      </nav>

      <section className="relative z-10 flex flex-1 items-center justify-center px-6 py-16 text-center sm:py-24">
        <div className="flex max-w-2xl flex-col items-center">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d8cabc] bg-[#fffaf3] px-4 py-2 text-xs font-medium text-[#776b5f] shadow-sm"><span className="size-1.5 rounded-full bg-[#6d9b8e]" /> A small world, one hello away</div>
          <h1 className="text-balance text-6xl font-semibold leading-[0.94] tracking-[-0.08em] sm:text-7xl lg:text-[104px]">Meet someone <span className="text-[#c56f4c]">new.</span></h1>
          <p className="mt-7 max-w-md text-base leading-7 text-[#776b5f] sm:text-lg">One click. One real conversation. No profiles, no pressure.</p>
          <button onClick={findMatch} disabled={isMatching} className="group mt-10 flex min-h-14 items-center gap-3 rounded-full bg-[#342d28] px-8 py-4 text-base font-semibold text-[#fffaf3] shadow-xl shadow-[#342d28]/20 transition hover:-translate-y-0.5 hover:bg-[#50443b] disabled:cursor-wait disabled:opacity-80" type="button">{isMatching ? <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Zap className="size-5" fill="currentColor" />}{isMatching ? 'Opening your meeting...' : 'Start meeting'}{!isMatching && <ArrowRight className="size-5 transition group-hover:translate-x-1" />}</button>
          <p className="mt-5 text-xs text-[#9a8d7e]">Leave anytime. Be kind. Stay curious.</p>
        </div>
      </section>
    </main>
  )
}
