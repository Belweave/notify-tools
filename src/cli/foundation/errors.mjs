// SPDX-License-Identifier: Apache-2.0

export class UsageError extends Error {}

export class RequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
