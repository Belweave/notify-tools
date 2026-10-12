// SPDX-License-Identifier: Apache-2.0
import { connectMicroAuth, supportsMicroAuth } from "../../../dist/sdk/browser.mjs";

const get = (id) => document.getElementById(id);
const status = (message, error = false) => {
  get("status").textContent = message;
  get("status").classList.toggle("error", error);
};
let expiryTimer;
function signedOut() {
  clearTimeout(expiryTimer);
  get("connect-card").hidden = false;
  get("result-card").hidden = true;
  get("shared-fields").replaceChildren();
  get("subject").textContent = "";
}
async function showIdentity() {
  const response = await fetch("/auth/me", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) { signedOut(); return false; }
  const { identity, expiresAt } = await response.json();
  const list = get("shared-fields");
  list.replaceChildren();
  const fields = [["Display name", identity.name], ["Email", identity.email], ["Phone number", identity.profile?.phone], ["Time zone", identity.profile?.timeZone], ["Pronouns", identity.profile?.pronouns]];
  for (const item of identity.profile?.custom ?? []) fields.push([item.label, item.value]);
  let count = 0;
  for (const [label, value] of fields) {
    if (value === undefined || value === "") continue;
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
    count++;
  }
  get("no-fields").hidden = count > 0;
  get("subject").textContent = identity.subject;
  get("connect-card").hidden = true;
  get("result-card").hidden = false;
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => { signedOut(); status("This demo session expired. Connect again whenever you’re ready."); }, Math.max(0, expiresAt - Date.now()));
  return true;
}
get("connect").addEventListener("click", async () => {
  if (!supportsMicroAuth()) {
    status("Open this app inside Notify 1.5.2 (16) or newer to try microAuth.");
    return;
  }
  const button = get("connect");
  button.disabled = true;
  status("Review the sign-in request in Notify. Sharing is your choice.");
  try {
    const fields = [...document.querySelectorAll('input[name="field"]:checked')].map((input) => input.value);
    const result = await connectMicroAuth({ challengePath: "/auth/challenge", sessionPath: "/auth/session", fields });
    if (!result.available || !(await showIdentity())) throw new Error("No session");
    status("");
    get("result-heading").focus();
  } catch {
    status("The connection wasn’t completed. You can try again when you’re ready.", true);
  } finally { button.disabled = false; }
});
get("disconnect").addEventListener("click", async () => {
  const button = get("disconnect");
  button.disabled = true;
  try {
    const response = await fetch("/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    if (!response.ok) throw new Error("Clear failed");
    signedOut();
    status("This demo session is cleared. Your Notify profile is unchanged.");
    get("connect").focus();
  } catch { status("Couldn’t clear the session. Please try again.", true); }
  finally { button.disabled = false; }
});
showIdentity().catch(() => status("Connection unavailable. Please try again.", true));
