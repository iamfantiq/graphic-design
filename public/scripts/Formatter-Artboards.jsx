/*
  Formatter — social artboards for Adobe Illustrator
  ---------------------------------------------------
  Creates new artboards (1:1, 4:5, 9:16, 16:9 …) next to the active artboard and copies
  its artwork into each one, scaled to fit or to fill. Everything stays vector and editable,
  each layer keeps its own group, so you can then nudge the title, date etc. per format.

  Install: File → Scripts → Other Script… (or copy into Illustrator's Presets/Scripts folder).
  Use:     select the artboard with your poster (make it active), run the script.
  Notes:   locked or hidden layers are skipped (Illustrator does not select them).
           Status: written without access to Illustrator — run it on a copy of your file first.
*/
#target illustrator

(function () {
  if (app.documents.length === 0) { alert('Open a document first.'); return; }
  var doc = app.activeDocument;

  var FORMATS = [
    { name: '1x1',    w: 1080, h: 1080, on: true },
    { name: '4x5',    w: 1080, h: 1350, on: true },
    { name: '9x16',   w: 1080, h: 1920, on: true },
    { name: '16x9',   w: 1920, h: 1080, on: true },
    { name: '2x3',    w: 1000, h: 1500, on: false },
    { name: '1.91x1', w: 1200, h: 628,  on: false }
  ];

  // ---------- dialog ----------
  var dlg = new Window('dialog', 'Formatter — social artboards');
  dlg.alignChildren = 'fill';
  var pf = dlg.add('panel', undefined, 'Formats (px)');
  pf.alignChildren = 'left';
  var boxes = [];
  for (var i = 0; i < FORMATS.length; i++) {
    var cb = pf.add('checkbox', undefined, FORMATS[i].name + '  —  ' + FORMATS[i].w + ' × ' + FORMATS[i].h);
    cb.value = FORMATS[i].on;
    boxes.push(cb);
  }
  var pm = dlg.add('panel', undefined, 'Placement');
  pm.alignChildren = 'left';
  var rFit = pm.add('radiobutton', undefined, 'Fit — whole design visible (fill the gaps yourself)');
  var rFill = pm.add('radiobutton', undefined, 'Fill — cover the artboard, edges get cropped');
  rFit.value = true;
  var bgCb = dlg.add('checkbox', undefined, 'Add a background rectangle in the poster’s first swatch colour');
  bgCb.value = false;
  var btns = dlg.add('group');
  btns.alignment = 'right';
  btns.add('button', undefined, 'Cancel', { name: 'cancel' });
  btns.add('button', undefined, 'Create', { name: 'ok' });
  if (dlg.show() !== 1) return;

  // ---------- source ----------
  var srcIndex = doc.artboards.getActiveArtboardIndex();
  var srcAb = doc.artboards[srcIndex];
  var r = srcAb.artboardRect; // [left, top, right, bottom], y grows upwards
  var srcW = r[2] - r[0], srcH = r[1] - r[3];

  doc.selection = null;
  doc.artboards.setActiveArtboardIndex(srcIndex);
  doc.selectObjectsOnActiveArtboard();
  var sel = doc.selection;
  if (!sel || sel.length === 0) { alert('Nothing selectable on the active artboard (are the layers locked?).'); return; }
  var items = [];
  for (var s = 0; s < sel.length; s++) items.push(sel[s]);
  doc.selection = null;

  // place new artboards to the right of everything that already exists
  var maxRight = -Infinity;
  for (var a = 0; a < doc.artboards.length; a++) maxRight = Math.max(maxRight, doc.artboards[a].artboardRect[2]);
  var gap = Math.max(100, srcW * 0.1);
  var cursorX = maxRight + gap;

  var made = 0;
  for (var f = 0; f < FORMATS.length; f++) {
    if (!boxes[f].value) continue;
    var fmt = FORMATS[f];
    var scale = rFill.value ? Math.max(fmt.w / srcW, fmt.h / srcH) : Math.min(fmt.w / srcW, fmt.h / srcH);
    // in Fill mode artwork sticks out sideways: keep it clear of the neighbouring artboards
    var overflowX = Math.max(0, srcW * scale - fmt.w) / 2;
    var left = cursorX + overflowX, top = r[1];
    var ab = doc.artboards.add([left, top, left + fmt.w, top - fmt.h]);
    ab.name = srcAb.name + ' — ' + fmt.name;
    cursorX = left + fmt.w + overflowX + gap;
    var offX = (fmt.w - srcW * scale) / 2;
    var offY = (fmt.h - srcH * scale) / 2;

    if (bgCb.value && doc.swatches.length > 2) {
      var bgRect = doc.activeLayer.pathItems.rectangle(top, left, fmt.w, fmt.h);
      bgRect.stroked = false;
      bgRect.filled = true;
      bgRect.fillColor = doc.swatches[2].color; // [0]=None, [1]=Registration on most documents
      bgRect.zOrder(ZOrderMethod.SENDTOBACK);
    }

    // one group per layer, so the layer structure survives
    var groups = {};
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var layer = it.layer;
      var key = layer.name + '#' + k;
      for (var gk in groups) { if (groups[gk].layer === layer) { key = gk; break; } }
      if (!groups[key]) {
        var g = layer.groupItems.add();
        g.name = 'Formatter ' + fmt.name;
        groups[key] = { layer: layer, group: g };
      }
      it.duplicate(groups[key].group, ElementPlacement.PLACEATEND);
    }

    for (var key2 in groups) {
      var grp = groups[key2].group;
      if (grp.pageItems.length === 0) { grp.remove(); continue; }
      var pos = grp.position; // top-left
      var dx = pos[0] - r[0], dy = r[1] - pos[1];
      grp.resize(scale * 100, scale * 100, true, true, true, true, scale * 100, Transformation.TOPLEFT);
      grp.position = [left + offX + dx * scale, top - offY - dy * scale];
    }
    made++;
  }
  doc.artboards.setActiveArtboardIndex(srcIndex);
  alert('Created ' + made + ' artboard(s). Export them with File → Export → Export for Screens.');
})();
