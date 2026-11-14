// Flint in the website editor, in seven languages (feat/site-editor2 round 3). Each sentence must land on the same
// intent as its English twin, with something selected in the designer. Used by app/test/flint_lang_test.js.
// Shape: { english sentence: [es, pt, fr, de, ja, zh, ko] }.
'use strict';
module.exports = {
  'make this bigger': ['haz esto más grande', 'deixa isso maior', 'agrandis ça', 'mach das größer', 'これを大きくして', '把这个放大', '이거 크게 해줘'],
  'make this smaller': ['haz esto más pequeño', 'deixa isso menor', 'réduis ça', 'mach das kleiner', 'これを小さくして', '把这个缩小', '이거 작게 해줘'],
  'make this bold': ['pon esto en negrita', 'coloca isso em negrito', 'mets ça en gras', 'mach das fett', 'これを太字にして', '把这个加粗', '이거 굵게 해줘'],
  'center this': ['centra esto', 'centraliza isso', 'centre ça', 'zentriere das', 'これを中央にして', '把这个居中', '이거 가운데로 해줘'],
  'move this up': ['mueve esto arriba', 'move isso para cima', 'monte ça', 'schieb das nach oben', 'これを上に移動して', '把这个上移', '이거 위로 옮겨줘'],
  'move this down': ['mueve esto abajo', 'move isso para baixo', 'descends ça', 'schieb das nach unten', 'これを下に移動して', '把这个下移', '이거 아래로 옮겨줘'],
  'remove this': ['elimina esto', 'remove isso', 'supprime ça', 'entferne das', 'これを削除して', '删除这个', '이거 삭제해줘'],
  'duplicate this': ['duplica esto', 'duplica isso', 'duplique ça', 'dupliziere das', 'これを複製して', '复制这个', '이거 복제해줘'],
  'hide this on phones': ['oculta esto en móviles', 'esconde isso no celular', 'cache ça sur mobile', 'verstecke das auf dem Handy', 'これをスマホで非表示にして', '在手机上隐藏这个', '이거 휴대폰에서 숨겨줘'],
  'make this the main colour': ['pon esto del color principal', 'deixa isso na cor principal', 'mets ça dans la couleur principale', 'mach das in der Hauptfarbe', 'これをメインカラーにして', '把这个改成主色', '이거 메인 색으로 해줘'],
  'what should we update on the site': ['¿qué deberíamos actualizar en el sitio?', 'o que devemos atualizar no site?', "qu'est-ce qu'on devrait mettre à jour sur le site ?", 'was sollten wir auf der Website aktualisieren?', 'サイトで何を更新すべき？', '网站上应该更新什么？', '사이트에서 뭘 업데이트해야 할까?'],
  'apply what we decided': ['aplica lo que decidimos', 'aplica o que decidimos', "applique ce qu'on a décidé", 'setz um was wir beschlossen haben', '決めたことを反映して', '应用我们决定的内容', '우리가 결정한 것 적용해줘'],
  'change this to Fresh bread daily': ['cambia esto a Fresh bread daily', 'muda isso para Fresh bread daily', 'change ça en Fresh bread daily', 'ändere das zu Fresh bread daily', 'これをFresh bread dailyに変えて', '把这个改成Fresh bread daily', '이거 Fresh bread daily로 바꿔줘'],
};
