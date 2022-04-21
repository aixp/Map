#!/bin/sh

EXE=Map
APPDIR=${EXE}.AppDir

mkdir -p ${APPDIR}/usr/bin
mkdir -p ${APPDIR}/usr/lib
mkdir -p ${APPDIR}/usr/share

env EXE=${EXE} ./mkAppImage.cp-lib.sh

cat <<DATA > ${APPDIR}/AppRun
#!/bin/sh

HERE=\`dirname \$0\`

mkdir -p "\${HOME}/.config/${EXE}" && cp -pu "\${HERE}/providers.json" "\${HOME}/.config/${EXE}/"

mkdir -p "\${HOME}/.local/share/${EXE}" && cp -Rpu "\${HERE}/data/." "\${HOME}/.local/share/${EXE}/"

mkdir -p "\${HOME}/.local/share/${EXE}" && cp -Rpu "\${HERE}/usr/share/locale" "\${HOME}/.local/share/${EXE}/"

export GIO_MODULE_DIR="\${HERE}/usr/lib/gio/modules"
"\${HERE}/usr/lib64/ld-linux-x86-64.so.2" --library-path "\${HERE}/usr/lib" "\${HERE}//usr/bin/${EXE}" "\${@}"
DATA
chmod +x ${APPDIR}/AppRun

cp ${EXE} ${APPDIR}/usr/bin/
strip -s ${APPDIR}/usr/bin/${EXE}
patchelf --set-rpath '$ORIGIN/../lib' ${APPDIR}/usr/bin/${EXE}

cp ${EXE}.svg ${APPDIR}/
cp -RpL mo/. ${APPDIR}/usr/share/locale

cat <<DATA > ${APPDIR}/${EXE}.desktop
[Desktop Entry]
Categories=Utility;
Icon=${EXE}
Name=${EXE}
Type=Application
Exec=${EXE}
DATA

# Map-specific

cp -p providers.json ${APPDIR}/

# cp -RpL data ${APPDIR}/
find data -type f -name "*.png" -exec cp --parents {} ${APPDIR}/ \;

appimagetool ${EXE}.AppDir
