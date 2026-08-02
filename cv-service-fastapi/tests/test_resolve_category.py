"""Regression: pemetaan label model → kategori kontrak (organic|inorganic).

Kelas "Sampah-Anorganik" (ber-tanda-hubung) SEMPAT tak terpetakan sehingga
menghasilkan category=None (objek dianggap tak terdeteksi). Test ini mengunci
perilaku resolver agar variasi penamaan tetap terklasifikasi.
"""

import pytest

from app.config import resolve_category


@pytest.mark.parametrize(
    "label,expected",
    [
        # Kelas asli model Roboflow deteksi-sampah-organik-anorganik/3
        ("Sampah Organik", "organic"),
        ("Sampah Anorganik", "inorganic"),
        ("Sampah-Anorganik", "inorganic"),  # varian tanda-hubung — dulu None
        # Identitas & variasi kapital/spasi
        ("organic", "organic"),
        ("inorganic", "inorganic"),
        ("ORGANIK", "organic"),
        (" anorganik ", "inorganic"),
        # Label spesifik model lain (COCO / Kaggle) tetap lewat exact-map
        ("banana", "organic"),
        ("bottle", "inorganic"),
        ("biological", "organic"),
        ("plastic", "inorganic"),
        # Tak dikenal → None (default aman)
        ("person", None),
        ("", None),
        (None, None),
    ],
)
def test_resolve_category(label, expected):
    assert resolve_category(label) == expected
