---
title: "How the Canopy Guide chat works and what it costs in energy"
url: https://github.com/allisonylee/hackumbc2026
source: Baltimore Tree Planting Planner (hackUMBC 2026)
---

Canopy Guide is the chat assistant in this app. It runs a small open language model, Qwen 3.5 with about 2 billion parameters, through Ollama on either a laptop or one small server. No question is sent to a cloud AI service.

It answers only from a small library of source documents about heat, trees, equity and Baltimore's tree programs, plus facts computed from the app's own data. When you name a neighborhood, it looks up that neighborhood's numbers. When you ask about a site from the Plan tab, it uses that site's facts and the reasons the heat model gives for why the block is hot. Answers cite their sources with numbers like [1], and you can open each source.

Each answer shows its energy use. On a Mac, the energy is measured directly from the chip's power sensors. On the server, it is estimated from the number of words generated. Common questions are answered from a saved copy, which uses almost no extra energy.

A small model can still make mistakes, so check the linked sources for anything important. If the sources don't cover a question, the guide should say it doesn't know.
