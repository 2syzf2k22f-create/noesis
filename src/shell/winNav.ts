"use client";
import { createContext, useContext } from "react";
/** Inside a side window: the window's own current page (so tabs highlight per window). */
export const WinCtx = createContext<{ href: string } | null>(null);
export const useWindowNav = () => useContext(WinCtx);
