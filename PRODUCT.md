# Product

<!-- impeccable:product-schema 1 -->

# TreeTutor

Local web app for learners following connected side questions. Source: PRD.md (behavior and acceptance criteria) and docs/visual-identity-spec.md (look and layout). Accepted architecture: docs/architecture-proposal.md.

## Platform

web

## Stack

React, TypeScript, Vite, Astryx (the component library; the visual world ships as a custom Astryx theme); loopback Node server and SQLite. Claude (default) through the official Claude Code CLI and its own sign-in; Codex app-server with app-owned Sign in with ChatGPT credentials; an optional custom OpenAI-compatible endpoint; no API-key fallback for the subscription providers.

## Users

Anyone learning with LLMs: students and independent learners exploring unfamiliar topics, often in long reading sessions.

## Product Purpose

An LLM explanation introduces concepts the learner does not yet understand. TreeTutor lets them branch a focused child conversation from the exact passage, keep the original thread intact, and see every conversation as a node on a learning tree map. Success: first, a place to think, where long tutor replies are comfortable to read for an evening; second, a learning tree map that is recognisable at a glance as TreeTutor.

## Positioning

Conversations are a tree, not a list: each child conversation is anchored to the passage it came from and inherits its ancestors' context, and the map shows that structure.

## Operating Context

Operate mode on a desktop browser: frequent reading and asking, often in the evening and for long sessions. The learner moves between the learning tree map and the focused chat, branches from selected passages, folds branches, navigates by keyboard (including optional Vim bindings), switches model and provider, and reads Markdown, math, Mermaid diagrams and generated videos in replies. Saving and generation failures stay visible; original transcripts stay readable.

## Capabilities and Constraints

- Dark is the default appearance; light is designed with equal care. Appearance setting: Dark, Light, System, persisted per browser.
- Question bubbles always use the current theme's colour; there is no separate bubble colour setting.
- Figtree and the old neutral palette are not pinned.
- Every PRD flow keeps working through the redesign: branching from a passage, map navigation, folding, keyboard and Vim access, model switching, saving and restoring, media, suggestions, the knowledge graph.

## Brand Commitments

Name: TreeTutor. Feels wrong (anti-references): childish or gamified; generic SaaS dashboard; neon hacker-dark; decoration that competes with reply text; cramped or tool-dense.

## Evidence on Hand

No logo, imagery or marketing assets exist. Real content is the learner's own conversations; do not fabricate testimonials or claims.

## Product Principles

- Reply text comes first; chrome recedes while reading.
- The tree is the identity: structure, not ornament, makes the map recognisable.
- Every existing behavior survives a change of look.
