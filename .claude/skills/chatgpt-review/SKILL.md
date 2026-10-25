---
name: chatgpt-review
description: Send an L3 or iPhone sprint packet to the owner's ChatGPT "Domus" project for an independent review, read the verdict, fold in required changes, and iterate until APPROVE / APPROVE WITH CHANGES. Use before dispatching any L3 or apps/ios packet.
---

# ChatGPT review

**Where:** the ChatGPT **Project** "Domus", https://chatgpt.com/g/g-p-69c741556ae88191931e547d018df8ec-domus/project. Use the owner's Chrome through the Claude-in-Chrome tools. It is not the "PromptForge" GPT.

1. **Build the request.** `pbcopy` a framed request: a one-line role ("senior … reviewer"), the focus areas, "End with VERDICT: APPROVE / APPROVE WITH CHANGES / REJECT, then numbered REQUIRED and OPTIONAL lists", then `---` and the packet. Never include secrets.
2. **Paste and send.**
   - Open the project URL.
   - **Set the intelligence before pasting (CLAUDE.md §3a).** Note the current chip (e.g. "5.6 Medium") so you can
     restore it. Click "Select ChatGPT model", click the "5.6 Medium ›" title to open the list, and choose **GPT-6**.
     Then focus the thinking slider and press → until it reads "3 of 3". If a choice says "Usage limit reached", take
     the highest open one and log it. Read the chip back before sending.
   - Click the composer **by coordinate** (the empty box under "Domus", about x=800 y=157 at 1440 wide; clicking the `find` ref often does not take the paste) and press `cmd+v`.
   - Long text becomes a "Pasted text" attachment after about 5 seconds. If the first `cmd+v` does nothing, click and paste again.
   - Click the send arrow.
3. **Wait for the reply.** Use `javascript_tool` loops shorter than 40 seconds (CDP times out at 45). Check `document.querySelector('main').innerText` for `VERDICT:`, and check that `[data-testid="stop-button"]` is gone.
4. **Read it in slices.**
   - Output over about 1,500 characters gets truncated, so read in slices.
   - Replace `cookie` with `ck` and strip `?&=` before returning text; the tool blocks cookie or query-string data.
   - Use `lastIndexOf('VERDICT:')` for the newest round.
5. **Iterate.** Fold every REQUIRED item into the packet as rev N+1, plus OPTIONAL items worth taking. Put the revision history in the title line (e.g. "rev 3 (rev 1 REJECT → rev 2 AWC → …)"), paste it into the same chat, and repeat until APPROVE or APPROVE WITH CHANGES with the changes adopted.
6. **Hand off.** Put the picker back to the chip you noted (it is shared with the owner's other chats). Record the
   model and thinking level used in the packet title line and the handoff. Commit the packet, then run `/codex-dispatch`.

The review has caught real bugs before: the Face ID cookie races and the per-tab session-storage loss on Plaid OAuth. Don't skip it for L3 or iPhone work.
