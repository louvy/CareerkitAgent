"""质量门禁（QualityGate）单元测试：pass/retry/degrade/reject 决策路径。"""

import pytest

from app.harness.quality_gate import GateDecision, QualityGate, ReviewVerdict


@pytest.fixture()
def gate():
    return QualityGate(threshold=6.0, max_retries=2)


def verdict(score: float) -> ReviewVerdict:
    return ReviewVerdict(score=score, dimensions={"fact_accuracy": score})


class TestQualityGate:
    def test_pass_above_threshold(self, gate):
        assert gate.decide(verdict(8.0)) == GateDecision.PASS

    def test_pass_at_threshold(self, gate):
        assert gate.decide(verdict(6.0)) == GateDecision.PASS

    def test_retry_within_budget(self, gate):
        assert gate.decide(verdict(4.0), retry_count=0) == GateDecision.RETRY
        assert gate.decide(verdict(4.0), retry_count=1) == GateDecision.RETRY

    def test_degrade_when_retries_exhausted(self, gate):
        assert gate.decide(verdict(4.0), retry_count=2) == GateDecision.DEGRADE

    def test_reject_when_too_low(self, gate):
        assert gate.decide(verdict(1.0), retry_count=2) == GateDecision.REJECT

    def test_constitution_error_always_reject(self, gate):
        assert gate.decide(verdict(9.0), has_constitution_error=True) == GateDecision.REJECT

    def test_run_records_decision(self, gate):
        decision, record = gate.run(verdict(8.0))
        assert decision == GateDecision.PASS
        assert record["decision"] == "pass"
        assert record["score"] == 8.0
        assert record["threshold"] == 6.0

    def test_default_threshold_from_settings(self):
        gate = QualityGate()
        assert gate.threshold == 6.0
