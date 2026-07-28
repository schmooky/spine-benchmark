import { create } from "zustand";

type AuthStatus = "anonymous" | "authenticated";

interface SessionState {
  status: AuthStatus;
  /** Whether the welcome tour has been shown this session. */
  tourCompleted: boolean;
  login: () => void;
  logout: () => void;
  completeTour: () => void;
}

/** Tiny session store: who is here and whether we've greeted them. */
export const useSessionStore = create<SessionState>((set) => ({
  status: "anonymous",
  tourCompleted: false,
  login: () => set({ status: "authenticated" }),
  logout: () => set({ status: "anonymous", tourCompleted: false }),
  completeTour: () => set({ tourCompleted: true }),
}));
