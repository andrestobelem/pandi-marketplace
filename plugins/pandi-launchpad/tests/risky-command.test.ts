import { describe, expect, it } from "vitest";
import { riskyCommandReason } from "../src/risky-command.ts";

describe("riskyCommandReason", () => {
  it("flags a force-push", () => {
    expect(riskyCommandReason("git push --force origin main")).toMatch(/force/i);
    expect(riskyCommandReason("git push -f origin main")).toMatch(/force/i);
  });

  it("does not flag a plain push", () => {
    expect(riskyCommandReason("git push origin main")).toBeNull();
  });

  it("flags git reset --hard", () => {
    expect(riskyCommandReason("git reset --hard HEAD~1")).toMatch(/reset --hard/i);
  });

  it("does not flag a soft reset", () => {
    expect(riskyCommandReason("git reset --soft HEAD~1")).toBeNull();
  });

  it("flags git clean with -f", () => {
    expect(riskyCommandReason("git clean -fd")).toMatch(/clean/i);
  });

  it("flags git branch -D", () => {
    expect(riskyCommandReason("git branch -D feature-x")).toMatch(/branch -D/i);
  });

  it("flags rm -rf regardless of flag order", () => {
    expect(riskyCommandReason("rm -rf node_modules")).toMatch(/rm/i);
    expect(riskyCommandReason("rm -fr node_modules")).toMatch(/rm/i);
    expect(riskyCommandReason("rm -r -f node_modules")).toMatch(/rm/i);
    expect(riskyCommandReason("rm --recursive --force node_modules")).toMatch(/rm/i);
  });

  it("does not flag a plain rm", () => {
    expect(riskyCommandReason("rm file.txt")).toBeNull();
  });

  it("flags a discarding checkout/restore", () => {
    expect(riskyCommandReason("git checkout -- .")).toMatch(/checkout/i);
    expect(riskyCommandReason("git checkout .")).toMatch(/checkout/i);
    expect(riskyCommandReason("git restore .")).toMatch(/restore/i);
    expect(riskyCommandReason("git restore src/file.ts")).toMatch(/restore/i);
  });

  it("does not flag switching branches with checkout", () => {
    expect(riskyCommandReason("git checkout main")).toBeNull();
    expect(riskyCommandReason("git checkout -b feature-x")).toBeNull();
  });

  it("does not flag an unrelated command", () => {
    expect(riskyCommandReason("npm install")).toBeNull();
    expect(riskyCommandReason("ls -la")).toBeNull();
    expect(riskyCommandReason("git status")).toBeNull();
  });
});
