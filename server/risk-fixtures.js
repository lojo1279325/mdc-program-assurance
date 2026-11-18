// Synthetic test fixtures only. No client facts or screening results.
import { draftRiskPolicy, normalizeRiskAssessment, RISK_RULES } from "../public/risk-model.js";
import { normalizeReview } from "../public/rules.js";

export function syntheticPolicy() {
  return {
    ...draftRiskPolicy({
      appetiteReference: "Synthetic test approval. Not a client policy.",
      criticalOperations: "Synthetic module availability.",
      concentrationTolerance: "Record independent alternates.",
      mitigationExpectations: "Validate each control before crediting it.",
      escalationThreshold: "Escalate applicable prohibitions and unsupported decisions.",
      lifecycle: "Reassess on material change. Test policy only.",
    }),
    id: "QA-v1", status: "Approved",
  };
}

export function syntheticAssessment(overrides = {}) {
  const policy = overrides.policy || syntheticPolicy();
  const input = {
    policy, policyVersion: policy.id, scope: "Synthetic test component in a simulated module.",
    evidenceConfidence: "High", followUp: "",
    facts: {
      prohibition: "no", designation: "no", ownershipKnown: "yes", ownershipNexus: "no",
      critical: "no", redundancy: "yes", singleSource: "no", qualifiedAlternate: "yes",
      switchDays: 5, recoveryDays: 10, commonDependency: "no", connected: "no",
      remoteAccess: "no", remoteControlled: "yes", supplierDeterioration: "no", materialChange: "no",
    },
    evidence: Object.fromEntries(RISK_RULES.map(rule => [rule.id, {
      note: "Synthetic dated evidence for testing only.", checkedOn: "2026-01-01", url: "https://example.org/synthetic-evidence",
    }])),
    ...overrides,
  };
  input.facts = { ...syntheticFacts(), ...(overrides.facts || {}) };
  return normalizeRiskAssessment(input);
}

function syntheticFacts() {
  return {
    prohibition: "no", designation: "no", ownershipKnown: "yes", ownershipNexus: "no",
    critical: "no", redundancy: "yes", singleSource: "no", qualifiedAlternate: "yes",
    switchDays: 5, recoveryDays: 10, commonDependency: "no", connected: "no",
    remoteAccess: "no", remoteControlled: "yes", supplierDeterioration: "no", materialChange: "no",
  };
}

export function syntheticRecord(overrides = {}) {
  return normalizeReview({
    code: "Q-01", title: "Synthetic test component", projectId: "QA", ownerRole: "nstt", reviewerRole: "cpi",
    stage: "How", layer: "Recommendation", supplier: "Synthetic Supplier", sourceItem: "QA-PART",
    evidence: "Synthetic test evidence.", lifecycle: "Reassess synthetic facts when conditions change.",
    condition: "No real purchasing or operating decision.", action: "Proceed", risk: "Low", confidence: "High",
    ...overrides,
  });
}

export function syntheticValidation(overrides = {}) {
  return {
    finalRisk: "Low", confidence: "High", action: "Proceed", rationale: "Synthetic reviewer rationale.",
    validatedMitigations: [], ...overrides,
  };
}
