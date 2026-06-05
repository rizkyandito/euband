#!/usr/bin/env bash
# ============================================================
#  deploy.sh — push perubahan dashboard ke GitHub (auto-deploy Vercel)
#
#  Cara pakai:
#    ./deploy.sh                  -> commit pakai pesan default + waktu
#    ./deploy.sh "ganti judul"    -> commit pakai pesan sendiri
#
#  Setelah push, Vercel otomatis deploy ~30 detik ke euband.vercel.app
# ============================================================

# pindah ke folder script ini berada (biar bisa dijalankan dari mana saja)
cd "$(dirname "$0")" || exit 1

# pesan commit: pakai argumen kalau ada, kalau tidak pakai default
PESAN="${1:-update tampilan dashboard}"

echo "📁 Folder : $(pwd)"
echo "📝 Pesan  : $PESAN"
echo ""

# cek apakah ada perubahan
if [ -z "$(git status --porcelain)" ]; then
  echo "✅ Tidak ada perubahan. Semua sudah ter-push."
  exit 0
fi

echo "Perubahan yang akan di-push:"
git status --short
echo ""

git add -A || { echo "❌ git add gagal"; exit 1; }
git commit -m "$PESAN" || { echo "❌ git commit gagal"; exit 1; }

echo ""
echo "🚀 Mengirim ke GitHub..."
if git push origin main; then
  echo ""
  echo "✅ Berhasil! Tunggu ~30 detik, lalu cek:"
  echo "   https://euband.vercel.app"
else
  echo ""
  echo "❌ Push gagal. Cek koneksi internet / login GitHub."
  exit 1
fi
