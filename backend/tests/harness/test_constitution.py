"""宪法（Constitution）规则单元测试：虚构事实检测与提示词注入。"""

from app.harness.constitution import (
    CONSTITUTION_PREAMBLE,
    CONSTITUTION_RULES,
    FABRICATION_MARKERS,
    constitution_text,
    has_blocking_violation,
    validate_output,
)


class TestConstitutionText:
    def test_contains_all_rules(self):
        text = constitution_text()
        for rule in CONSTITUTION_RULES:
            assert rule.id in text

    def test_includes_extra_rules(self):
        text = constitution_text(extra_rules=["补充条款"])
        assert "[EXTRA] 补充条款" in text

    def test_disabled_rules_excluded(self, monkeypatch):
        import dataclasses

        disabled = dataclasses.replace(CONSTITUTION_RULES[0], enabled=False)
        monkeypatch.setattr("app.harness.constitution.CONSTITUTION_RULES", [disabled])
        text = constitution_text()
        assert disabled.id not in text


class TestFabricationDetection:
    def test_detect_fabrication_marker(self):
        violations = validate_output(
            "我负责的系统上线后日活增长 300%。",
            source_text="负责 XX 系统的研发。",
        )
        blocking = [v for v in violations if v.rule_id == "FACT_NO_FABRICATION"]
        assert len(blocking) == 1
        assert blocking[0].severity == "error"
        assert has_blocking_violation(violations)

    def test_marker_present_in_source_is_ok(self):
        source = "负责 XX 系统研发，上线后日活增长 300%。"
        violations = validate_output("日活增长 300%", source_text=source)
        assert not has_blocking_violation(violations)

    def test_fact_list_check(self):
        violations = validate_output(
            "曾获得全国数学竞赛一等奖。",
            source_text="本科计算机科学。",
            facts=["全国数学竞赛一等奖"],
        )
        assert has_blocking_violation(violations)

    def test_empty_output_no_violation(self):
        assert validate_output("") == []
        assert validate_output(None) == []


class TestConstitutionMarks:
    def test_markers_are_defined(self):
        assert len(FABRICATION_MARKERS) > 0

    def test_preamble_present(self):
        assert CONSTITUTION_PREAMBLE.startswith("## 全局宪法")
