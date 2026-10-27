// SPDX-License-Identifier: Apache-2.0
export declare const NODE_ENGINE_RANGE: "^22.23.4 || ^24.22.1 || ^26.12.1";
export declare function isSupportedNodeVersion(version: string): boolean;
export declare function assertSupportedNode(version?: string): void;
