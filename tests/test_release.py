import hashlib
import json

import pandas as pd
import pytest

from src.validate_release import verify_manifest, accounting_checks


def test_manifest_rejects_corruption(tmp_path):
    path = tmp_path / "sample.parquet"
    pd.DataFrame({"amount": [1, 2, 3]}).to_parquet(path, index=False)
    entry = {"path": path.name, "bytes": path.stat().st_size,
             "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rows": 3}
    (tmp_path / "manifest.json").write_text(json.dumps({"version": "test", "files": [entry]}))
    content = bytearray(path.read_bytes())
    content[30] ^= 1
    path.write_bytes(content)
    with pytest.raises(AssertionError, match="Checksum mismatch"):
        verify_manifest(tmp_path)


def test_accounting_independent_source_reconciliations():
    checks = accounting_checks()
    assert len(checks) == 10
    assert all(c["passed"] for c in checks)
