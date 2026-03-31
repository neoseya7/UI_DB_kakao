"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

type GuideModeContextType = {
    isGuideMode: boolean;
    toggleGuideMode: () => void;
}

const GuideModeContext = createContext<GuideModeContextType>({
    isGuideMode: false,
    toggleGuideMode: () => {},
})

export const useGuideMode = () => useContext(GuideModeContext)

export function GuideModeProvider({ children }: { children: React.ReactNode }) {
    const [isGuideMode, setIsGuideMode] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
        const stored = localStorage.getItem("guide_mode")
        if (stored === "true") setIsGuideMode(true)
    }, [])

    const toggleGuideMode = () => {
        setIsGuideMode(prev => {
            const next = !prev
            localStorage.setItem("guide_mode", String(next))
            return next
        })
    }

    // Not exposing state until mounted prevents hydration mismatches, but we want children to render immediately
    // so we just return the provider directly. The badge elements will only show if isGuideMode is true (which requires mount anyway).
    return (
        <GuideModeContext.Provider value={{ isGuideMode: isMounted ? isGuideMode : false, toggleGuideMode }}>
            {children}
        </GuideModeContext.Provider>
    )
}
