/**
 * @fileoverview PWA spawner — generates and deploys visual artifacts.
 *
 * Not a Durable Object: a stateless set of methods used by the ArticleChatAgent
 * to turn article content into PWAs, mind maps, and summary cards.
 */

export { generatePWACode } from "./methods/generatePWACode";
export { deployPWAToR2 } from "./methods/deployToR2";
export type { ArtifactType, DeployResult } from "./types";
