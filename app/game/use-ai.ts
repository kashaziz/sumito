"use client";

import { useCallback, useEffect, useRef } from "react";
import { chooseComputerMove, type ComputerChoice, type Difficulty } from "../../lib/game/ai";
import type { Board, Player, Scores } from "../../lib/game/engine";

export type AiRequest = { board: Board; scores: Scores; player: Player; difficulty: Difficulty };
type Pending = { request: AiRequest; resolve: (choice: ComputerChoice | null) => void };

/**
 * Returns a function that asks the AI for a move. A single Web Worker is created on first use
 * and reused for every request. If the worker fails, requests fall back to the main thread.
 */
/** Main-thread fallback. Resolves null on any error, so a caller is never left waiting. */
function chooseSafely(request: AiRequest): ComputerChoice | null {
  try {
    return chooseComputerMove(request.board, request.scores, request.player, request.difficulty);
  } catch {
    return null;
  }
}

export function useAi() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextIdRef = useRef(0);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return useCallback((request: AiRequest) => new Promise<ComputerChoice | null>((resolve) => {
    const runOnMainThread = () => resolve(chooseSafely(request));
    let worker = workerRef.current;
    if (!worker) {
      try {
        worker = new Worker(new URL("../ai.worker.ts", import.meta.url), { type: "module" });
      } catch {
        runOnMainThread();
        return;
      }
      const created = worker;
      created.onmessage = (event: MessageEvent<{ id: number; choice: ComputerChoice | null }>) => {
        const pending = pendingRef.current.get(event.data.id);
        pendingRef.current.delete(event.data.id);
        pending?.resolve(event.data.choice);
      };
      created.onerror = () => {
        created.terminate();
        if (workerRef.current === created) workerRef.current = null;
        const waiting = [...pendingRef.current.values()];
        pendingRef.current.clear();
        waiting.forEach(({ request: failed, resolve: done }) => done(chooseSafely(failed)));
      };
      workerRef.current = created;
    }
    const id = ++nextIdRef.current;
    pendingRef.current.set(id, { request, resolve });
    worker.postMessage({ id, ...request });
  }), []);
}
