"use client"

import React, { useState } from "react"
import { useGuideMode } from "@/components/layout/guide-context"
import { cn } from "@/lib/utils"

export function GuideBadge({ children, text, className }: { children: React.ReactNode, text: string, className?: string }) {
    const { isGuideMode } = useGuideMode()
    const [isHovered, setIsHovered] = useState(false)

    if (!isGuideMode) return <>{children}</>

    return (
        <div 
            className={cn("relative inline-block w-fit group", className)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setIsHovered(!isHovered)}
        >
            {children}
            
            {/* The Animated Notification Dot */}
            <div className="absolute -top-1.5 -right-1.5 z-40 flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white shadow-sm border border-white cursor-help pointer-events-none">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full text-[10px] font-extrabold pb-[1px]">?</span>
            </div>

            {/* The Tooltip Balloon */}
            <div 
                className={cn(
                    "absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max sm:w-max max-w-[220px] sm:max-w-[340px] bg-slate-800 text-white text-[12px] sm:text-[13px] font-medium p-2.5 sm:p-3 rounded-xl shadow-2xl z-[100] transition-all duration-200 pointer-events-none break-words whitespace-normal text-left origin-top tracking-tight leading-relaxed",
                    isHovered ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible"
                )}
            >
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rotate-45 pointer-events-none rounded-sm" />
                {text}
            </div>
        </div>
    )
}
