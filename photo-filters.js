export function photoFolder(photo){return photo.kind==='pair'||photo.person==='Èric i Aleix'||photo.person==='Aleix i Èric'?'Conjuntes':photo.person;}
export function photoOrder(photo){return photo.person==='Aleix i Èric'?'ae':photo.person==='Èric i Aleix'?'ea':'';}
export function filterPhotos(photos,{folder='all',order='all',state='all'}={}){return photos.filter(p=>(folder==='all'||photoFolder(p)===folder)&&(folder!=='Conjuntes'||order==='all'||photoOrder(p)===order)&&(state==='all'||(state==='enabled'?p.enabled!==false:p.enabled===false)));}
