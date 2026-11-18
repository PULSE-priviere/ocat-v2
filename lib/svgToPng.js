// SVG → PNG dans le navigateur (pour insérer les graphiques dans le fichier Word)
export function svgToPng(svg, w, h, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(async b => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('png'))), 'image/png');
    };
    img.onerror = () => reject(new Error('svg'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
