// These hosted clients still need OAuth and explicit administrator consent.
const clientOrigins = [
  "https://claude.ai",
  "https://claude.com",
  "https://chatgpt.com",
  "https://grok.com",
];

export function knownMcpOrigin(incoming: string, adminOrigin: string) {
  return incoming === adminOrigin || clientOrigins.includes(incoming);
}
