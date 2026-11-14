import { Star } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useFavorites } from './favorites-context';
export function FavoriteButton({id,name}:{id:string;name:string}){
 const favorites=useFavorites();if(!favorites)return null;
 const selected=favorites.known&&favorites.ids.includes(id);
 return <Button variant="quiet" className="favorite-button" aria-pressed={favorites.known?selected:undefined} aria-busy={favorites.busy} aria-label={`${selected?'Убрать из избранного':'Добавить в избранное'}: ${name}`} disabled={!favorites.ready||favorites.busy} onClick={()=>favorites.set(id,!selected)}><Star size={18} aria-hidden="true" fill={selected?'currentColor':'none'} /><span>{selected?'В избранном':favorites.ready?'В избранное':favorites.error?'Недоступно':'Проверяем…'}</span></Button>;
}
export function FavoritesNotice(){
 const favorites=useFavorites();if(!favorites)return null;
 return <div className="favorites-notice">{favorites.error?<p role="alert">{favorites.error} <Button variant="quiet" disabled={favorites.busy} onClick={favorites.refresh}>Обновить избранное</Button></p>:favorites.message?<p role="status" className="sr-only">{favorites.message}</p>:null}</div>;
}
