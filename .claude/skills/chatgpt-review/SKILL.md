---
name: chatgpt-review
description: Send an L3 or iPhone sprint packet to the owner's ChatGPT "Domus" project for an independent review, read the verdict, fold in required changes, and iterate until APPROVE / APPROVE WITH CHANGES. Use before dispatching any L3 or apps/ios packet.
---

# ChatGPT review

**Where:** the ChatGPT **Project** "Domus", https://chatgpt.com/g/g-p-69c741556ae88191931e547d018df8ec-domus/project. Use the owner's Chrome through the Claude-in-Chrome tools. It is not the "PromptForge" GPT.

1. **Build the request.** `pbcopy` a framed request: a one-line role ("senior … reviewer"), the focus areas, "End with VERDICT: APPROVE / APPROVE WITH CHANGES / REJECT, then numbered REQUIRED and OPTIONAL lists", then `---` and the packet. Never include secrets.
2. **Paste and send.**
   - Open the project URL. Click the composer (`find` "chat message composer textbox") and press `cmd+v`.
   - Long text becomes a "Pasted text" attachment after about 5 seconds. If the first `cmd+v` does nothing, click and paste again.
   - Click the send arrow.
3. **Wait for the reply.** Use `javascript_tool` loops shorter than 40 seconds (CDP times out at 45). Check `document.querySelector('main').innerText` for `VERDICT:`, and check that `[data-testid="stop-button"]` is gone.
4. **Read it in slices.**
   - Output over about 1,500 characters gets truncated, so read in slices.
   - Replace `cookie` with `ck` and strip `?&=` before returning text; the tool blocks cookie or query-string data.
   - Use `lastIndexOf('VERDICT:')` for the newest round.
5. **Iterate.** Fold every REQUIRED item into the packet as rev N+1, plus OPTIONAL items worth taking. Put the revision history in the title line (e.g. "rev 3 (rev 1 REJECT → rev 2 AWC → …)"), paste it into the same chat, and repeat until APPROVE or APPROVE WITH CHANGES with the changes adopted.
6. **Hand off.** Commit the packet, then run `/codex-dispatch`.

The review has caught real bugs before: the Face ID cookie races and the per-tab session-storage loss on Plaid OAuth. Don't skip it for L3 or iPhone work.
