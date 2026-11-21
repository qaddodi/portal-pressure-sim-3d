// "<Patient> loaded. <numbers>": said once, from the first engine frame that arrives after the load is requested, never from the frame on hand then (that is the last patient's).
// Patients switched in a row (A, B, C) leave one pending request, the newest, so the one announcement names and describes C. Pure: a test drives it with plain calls.
export function createPatientAnnouncer<F>(say: (id: string, frame: F) => void) {
  let pending: string | null = null;
  return {
    request(id: string) { pending = id; },
    frame(f: F) { if (pending === null) return; const id = pending; pending = null; say(id, f); },
    cancel() { pending = null; },
  };
}
