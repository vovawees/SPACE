#!/usr/bin/env bash
# SPACE: запуск на Linux и macOS — ./start.sh (или двойным щелчком «Запустить в терминале»).
# В первый раз сам ставит зависимости и собирает клиент, после обновления — тоже.
# Остановить — Ctrl+C. Чтобы SPACE работал сам в фоне и запускался при входе: npm run service

src="${BASH_SOURCE[0]}"
src="$(readlink -f -- "$src" 2>/dev/null || printf '%s' "$src")"
cd -- "$(dirname -- "$src")" || exit 1

# Node.js из менеджеров версий (nvm, fnm, volta, mise, asdf), если этот терминал их не подхватил
find_node() {
  command -v node >/dev/null 2>&1 && return 0
  local d
  for d in "$HOME/.volta/bin" "$HOME/.local/share/mise/shims" "$HOME/.asdf/shims" "$HOME/.local/bin" "$HOME/bin"; do
    if [ -x "$d/node" ]; then PATH="$d:$PATH"; return 0; fi
  done
  local nvm="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [ -s "$nvm" ]; then
    # shellcheck disable=SC1090
    . "$nvm" >/dev/null 2>&1
    nvm use --silent default >/dev/null 2>&1
    command -v node >/dev/null 2>&1 && return 0
  fi
  local f
  for f in "$(command -v fnm 2>/dev/null)" "$HOME/.local/share/fnm/fnm" "$HOME/.fnm/fnm"; do
    if [ -n "$f" ] && [ -x "$f" ]; then
      eval "$("$f" env 2>/dev/null)"
      command -v node >/dev/null 2>&1 && return 0
    fi
  done
  return 1
}

hint() {
  local id=""
  if [ -r /etc/os-release ]; then
    id="$(. /etc/os-release; echo " ${ID:-} ${ID_LIKE:-} ")"
  fi
  echo "  Как поставить:"
  case "$(uname -s)" in
    Darwin) echo "    brew install node      (или установщик с https://nodejs.org/)" ;;
    *)
      case "$id" in
        *" arch "*) echo "    sudo pacman -S nodejs npm" ;;
        *" debian "*|*" ubuntu "*)
          echo "    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -"
          echo "    sudo apt-get install -y nodejs" ;;
        *" fedora "*|*" rhel "*|*" centos "*) echo "    sudo dnf install nodejs npm" ;;
        *" suse "*|*" opensuse "*) echo "    sudo zypper install nodejs npm" ;;
        *" alpine "*) echo "    sudo apk add nodejs npm" ;;
      esac
      echo "    или без прав администратора, через fnm:"
      echo "      curl -fsSL https://fnm.vercel.app/install | bash"
      echo "      fnm install --lts      (потом откройте новый терминал)" ;;
  esac
}

pause_if_gui() {
  # запущен двойным щелчком, а не из оболочки — не закрывать окно сразу, чтобы была видна ошибка
  local parent
  parent="$(ps -o comm= -p "$PPID" 2>/dev/null)"
  case "$parent" in
    *sh | fish | nu | xonsh | tmux* | screen* | sshd* | "") return 0 ;;
  esac
  [ -t 0 ] && read -r -p "Нажмите Enter, чтобы закрыть окно…" _
  return 0
}

if ! find_node; then
  echo
  echo "  SPACE нужен Node.js 22.18 или новее (лучше 24 LTS), а его нет."
  hint
  echo
  pause_if_gui
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo
  echo "  Node.js есть ($(node -v)), а npm нет — в некоторых дистрибутивах он ставится отдельно:"
  echo "    Arch: sudo pacman -S npm · Debian/Ubuntu: sudo apt install npm · Fedora: sudo dnf install npm"
  echo
  pause_if_gui
  exit 1
fi

npm start
code=$?
[ $code -ne 0 ] && [ $code -ne 130 ] && pause_if_gui
exit $code
