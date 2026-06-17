"use client";

import type { ComponentType } from "react";
import type { GameId, GameModalProps } from "@/lib/gamehub/types";

import { SpinGame } from "./games/SpinGame";
import { QuizGame } from "./games/QuizGame";
import { KodwordGame } from "./games/KodwordGame";
import { GrupeGame } from "./games/GrupeGame";
import { TempoGame } from "./games/TempoGame";

/**
 * GameHub game registry.
 *
 * Maps every {@link GameId} to the component that renders that game's modal.
 * Each entry is a self-contained modal implementing {@link GameModalProps}
 * (own fixed overlay + dialog, ESC/backdrop close, onComplete on finish). The
 * map shape (Record<GameId, ComponentType<GameModalProps>>) is the single
 * contract the hub shell consumes, so games can change without touching the hub.
 */
export const GAME_COMPONENTS: Record<GameId, ComponentType<GameModalProps>> = {
  spin: SpinGame,
  quiz: QuizGame,
  kodword: KodwordGame,
  grupe: GrupeGame,
  tempo: TempoGame,
};

export default GAME_COMPONENTS;
