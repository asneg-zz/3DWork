#!/bin/bash
# Скрипт для очистки лишних snap mount юнитов

echo "Удаление лишних snap mount юнитов..."

# Список лишних mount юнитов (которых нет в snap list)
UNITS_TO_REMOVE=(
    "/etc/systemd/system/snap-blender-6559.mount"
    "/etc/systemd/system/snap-core-17247.mount"
    "/etc/systemd/system/snap-core20-2599.mount"
    "/etc/systemd/system/snap-cups-1100.mount"
    "/etc/systemd/system/snap-ffmpeg\x2d2404-108.mount"
    "/etc/systemd/system/snap-firmware\x2dupdater-167.mount"
    "/etc/systemd/system/snap-gnome\x2d3\x2d38\x2d2004-143.mount"
    "/etc/systemd/system/snap-hunspell\x2ddictionaries-21.mount"
    "/etc/systemd/system/snap-itrue\x2dkicad-7.mount"
    "/etc/systemd/system/snap-kf5\x2d5\x2d108\x2dqt\x2d5\x2d15\x2d10\x2dcore22-5.mount"
    "/etc/systemd/system/snap-kf6\x2dcore24-34.mount"
    "/etc/systemd/system/snap-kicad-18.mount"
    "/etc/systemd/system/snap-pgadmin4-19.mount"
    "/etc/systemd/system/snap-postgresql10-47.mount"
    "/etc/systemd/system/snap-postgresql-66.mount"
    "/etc/systemd/system/snap-pycharm\x2dcommunity-510.mount"
    "/etc/systemd/system/snap-snapd\x2ddesktop\x2dintegration-315.mount"
    "/etc/systemd/system/snap-snap\x2dstore-1270.mount"
    "/etc/systemd/system/snap-thunderbird-796.mount"
    "/etc/systemd/system/snap-vlc-3777.mount"
)

# Удаляем каждый файл
for unit in "${UNITS_TO_REMOVE[@]}"; do
    if [ -f "$unit" ]; then
        echo "Удаление: $unit"
        sudo rm "$unit"
    else
        echo "Файл не найден: $unit"
    fi
done

echo ""
echo "Перезагрузка systemd..."
sudo systemctl daemon-reload

echo ""
echo "Сброс failed юнитов..."
sudo systemctl reset-failed

echo ""
echo "Исправление WireGuard..."
sudo ip link delete wg0 2>/dev/null || true
sudo systemctl restart wg-quick@wg0

echo ""
echo "Пересборка модулей VirtualBox..."
sudo /sbin/vboxconfig

echo ""
echo "Проверка оставшихся failed юнитов..."
systemctl list-units --failed

echo ""
echo "Готово! Рекомендуется перезагрузить систему: sudo reboot"
