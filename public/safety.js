export function isSafetyConcern(text) {
  const lower = String(text).toLowerCase().replace(/\bform\b/g, 'from');
  return /\b(suicid\w*|self[\s-]?harm|kill myself|hurt myself|harm myself|end my life|want to die|wish i (?:was|were) dead|don't want to live|do not want to live)\b/i.test(lower)
    || /\b(?:wanted|want|planning|plan|thinking|thought|going)\b.{0,48}\b(?:jump|leap|throw myself)\b.{0,36}\b(?:from|off)\b.{0,24}\b(?:building|bulid\w*|roof|ledge|bridge|window)\b/i.test(lower)
    || /\b(?:jump|leap)\b.{0,16}\b(?:from|off)\b.{0,24}\b(?:building|bulid\w*|roof|ledge|bridge|window)\b/i.test(lower);
}
