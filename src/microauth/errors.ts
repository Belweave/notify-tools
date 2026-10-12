// SPDX-License-Identifier: Apache-2.0

export class MicroAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MicroAuthError";
  }
}
