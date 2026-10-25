"""Resolve optional research packages independently of the current directory."""
import os
import sys
from pathlib import Path


def load_local_dependencies():
    default = Path(__file__).resolve().parents[2] / '.codexdeps'
    dependency_root = Path(os.environ.get('GT_RESEARCH_DEPS', str(default))).resolve()
    if dependency_root.is_dir():
        sys.path.insert(0, str(dependency_root))
    return dependency_root
