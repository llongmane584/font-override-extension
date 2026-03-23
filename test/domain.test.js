const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.tldts = require("tldts");

const { extractDomain } = require("../domain.js");

test("strips www subdomain", () => {
  assert.equal(extractDomain("www.example.com"), "example.com");
});

test("strips arbitrary subdomain", () => {
  assert.equal(extractDomain("docs.example.com"), "example.com");
});

test("strips nested subdomains", () => {
  assert.equal(extractDomain("sub.docs.example.com"), "example.com");
});

test("preserves multi-level TLD (.co.uk)", () => {
  assert.equal(extractDomain("example.co.uk"), "example.co.uk");
});

test("strips subdomain from multi-level TLD (.co.uk)", () => {
  assert.equal(extractDomain("www.example.co.uk"), "example.co.uk");
});

test("preserves multi-level TLD (.co.jp)", () => {
  assert.equal(extractDomain("example.co.jp"), "example.co.jp");
});

test("strips subdomain from multi-level TLD (.co.jp)", () => {
  assert.equal(extractDomain("www.example.co.jp"), "example.co.jp");
});

test("returns bare domain unchanged", () => {
  assert.equal(extractDomain("example.com"), "example.com");
});

test("falls back to hostname for localhost", () => {
  assert.equal(extractDomain("localhost"), "localhost");
});

test("returns empty string for empty input", () => {
  assert.equal(extractDomain(""), "");
});

test("falls back to hostname for IP address", () => {
  assert.equal(extractDomain("192.168.1.1"), "192.168.1.1");
});
