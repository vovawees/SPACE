/* Значки для объекта «Значок»: подборка из набора Lucide с русскими
   словами для поиска. Хранится имя (ic), так что набор можно расширять. */
import type { Component } from "svelte";
import I_Star from "@lucide/svelte/icons/star";
import I_Heart from "@lucide/svelte/icons/heart";
import I_Check from "@lucide/svelte/icons/check";
import I_X from "@lucide/svelte/icons/x";
import I_Flag from "@lucide/svelte/icons/flag";
import I_Bell from "@lucide/svelte/icons/bell";
import I_House from "@lucide/svelte/icons/house";
import I_User from "@lucide/svelte/icons/user";
import I_Users from "@lucide/svelte/icons/users";
import I_Rocket from "@lucide/svelte/icons/rocket";
import I_Lightbulb from "@lucide/svelte/icons/lightbulb";
import I_Target from "@lucide/svelte/icons/target";
import I_Trophy from "@lucide/svelte/icons/trophy";
import I_Zap from "@lucide/svelte/icons/zap";
import I_Flame from "@lucide/svelte/icons/flame";
import I_Cloud from "@lucide/svelte/icons/cloud";
import I_Sun from "@lucide/svelte/icons/sun";
import I_Moon from "@lucide/svelte/icons/moon";
import I_Music from "@lucide/svelte/icons/music";
import I_Camera from "@lucide/svelte/icons/camera";
import I_MapPin from "@lucide/svelte/icons/map-pin";
import I_Calendar from "@lucide/svelte/icons/calendar";
import I_Clock from "@lucide/svelte/icons/clock";
import I_Mail from "@lucide/svelte/icons/mail";
import I_Phone from "@lucide/svelte/icons/phone";
import I_MessageCircle from "@lucide/svelte/icons/message-circle";
import I_ThumbsUp from "@lucide/svelte/icons/thumbs-up";
import I_Smile from "@lucide/svelte/icons/smile";
import I_TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import I_Info from "@lucide/svelte/icons/info";
import I_CircleHelp from "@lucide/svelte/icons/circle-help";
import I_Lock from "@lucide/svelte/icons/lock";
import I_Key from "@lucide/svelte/icons/key";
import I_Settings from "@lucide/svelte/icons/settings";
import I_Search from "@lucide/svelte/icons/search";
import I_Book from "@lucide/svelte/icons/book";
import I_Bookmark from "@lucide/svelte/icons/bookmark";
import I_Gift from "@lucide/svelte/icons/gift";
import I_Coffee from "@lucide/svelte/icons/coffee";
import I_Pizza from "@lucide/svelte/icons/pizza";
import I_Car from "@lucide/svelte/icons/car";
import I_Plane from "@lucide/svelte/icons/plane";
import I_Ship from "@lucide/svelte/icons/ship";
import I_Bike from "@lucide/svelte/icons/bike";
import I_Globe from "@lucide/svelte/icons/globe";
import I_Compass from "@lucide/svelte/icons/compass";
import I_Anchor from "@lucide/svelte/icons/anchor";
import I_Leaf from "@lucide/svelte/icons/leaf";
import I_TreePine from "@lucide/svelte/icons/tree-pine";
import I_FlowerTwo from "@lucide/svelte/icons/flower-2";
import I_Dog from "@lucide/svelte/icons/dog";
import I_Cat from "@lucide/svelte/icons/cat";
import I_Bird from "@lucide/svelte/icons/bird";
import I_Fish from "@lucide/svelte/icons/fish";
import I_Bug from "@lucide/svelte/icons/bug";
import I_Crown from "@lucide/svelte/icons/crown";
import I_Gem from "@lucide/svelte/icons/gem";
import I_Coins from "@lucide/svelte/icons/coins";
import I_Wallet from "@lucide/svelte/icons/wallet";
import I_ShoppingCart from "@lucide/svelte/icons/shopping-cart";
import I_Briefcase from "@lucide/svelte/icons/briefcase";
import I_GraduationCap from "@lucide/svelte/icons/graduation-cap";
import I_Pencil from "@lucide/svelte/icons/pencil";
import I_Palette from "@lucide/svelte/icons/palette";
import I_Image from "@lucide/svelte/icons/image";
import I_Film from "@lucide/svelte/icons/film";
import I_Headphones from "@lucide/svelte/icons/headphones";
import I_Mic from "@lucide/svelte/icons/mic";
import I_GamepadTwo from "@lucide/svelte/icons/gamepad-2";
import I_Puzzle from "@lucide/svelte/icons/puzzle";
import I_DiceFive from "@lucide/svelte/icons/dice-5";
import I_Swords from "@lucide/svelte/icons/swords";
import I_Shield from "@lucide/svelte/icons/shield";
import I_Skull from "@lucide/svelte/icons/skull";
import I_Ghost from "@lucide/svelte/icons/ghost";
import I_WandSparkles from "@lucide/svelte/icons/wand-sparkles";
import I_Sparkles from "@lucide/svelte/icons/sparkles";
import I_PartyPopper from "@lucide/svelte/icons/party-popper";
import I_Cake from "@lucide/svelte/icons/cake";
import I_Handshake from "@lucide/svelte/icons/handshake";
import I_Award from "@lucide/svelte/icons/award";
import I_Medal from "@lucide/svelte/icons/medal";
import I_CircleCheck from "@lucide/svelte/icons/circle-check";
import I_Ban from "@lucide/svelte/icons/ban";
import I_ArrowRight from "@lucide/svelte/icons/arrow-right";
import I_ArrowUp from "@lucide/svelte/icons/arrow-up";
import I_ArrowDown from "@lucide/svelte/icons/arrow-down";
import I_ArrowLeft from "@lucide/svelte/icons/arrow-left";
import I_RefreshCw from "@lucide/svelte/icons/refresh-cw";
import I_Hourglass from "@lucide/svelte/icons/hourglass";
import I_Battery from "@lucide/svelte/icons/battery";
import I_Wifi from "@lucide/svelte/icons/wifi";
import I_Code from "@lucide/svelte/icons/code";
import I_Terminal from "@lucide/svelte/icons/terminal";
import I_Database from "@lucide/svelte/icons/database";
import I_Laptop from "@lucide/svelte/icons/laptop";
import I_Smartphone from "@lucide/svelte/icons/smartphone";
import I_BuildingTwo from "@lucide/svelte/icons/building-2";
import I_School from "@lucide/svelte/icons/school";
import I_Store from "@lucide/svelte/icons/store";
import I_Tent from "@lucide/svelte/icons/tent";
import I_Mountain from "@lucide/svelte/icons/mountain";
import I_Waves from "@lucide/svelte/icons/waves";
import I_Snowflake from "@lucide/svelte/icons/snowflake";
import I_Umbrella from "@lucide/svelte/icons/umbrella";
import I_Droplet from "@lucide/svelte/icons/droplet";
import I_Thermometer from "@lucide/svelte/icons/thermometer";
import I_Wind from "@lucide/svelte/icons/wind";

export type IconComp = Component<Record<string, unknown>>;

const LIST: [string, IconComp, string][] = [
  ["star", I_Star, "звезда"],
  ["heart", I_Heart, "сердце любовь"],
  ["check", I_Check, "галочка готово"],
  ["x", I_X, "крестик нет"],
  ["flag", I_Flag, "флаг цель"],
  ["bell", I_Bell, "колокол уведомление"],
  ["house", I_House, "дом"],
  ["user", I_User, "человек"],
  ["users", I_Users, "люди команда"],
  ["rocket", I_Rocket, "ракета запуск"],
  ["lightbulb", I_Lightbulb, "идея лампа"],
  ["target", I_Target, "цель мишень"],
  ["trophy", I_Trophy, "кубок победа"],
  ["zap", I_Zap, "молния энергия"],
  ["flame", I_Flame, "огонь"],
  ["cloud", I_Cloud, "облако"],
  ["sun", I_Sun, "солнце"],
  ["moon", I_Moon, "луна ночь"],
  ["music", I_Music, "музыка"],
  ["camera", I_Camera, "камера фото"],
  ["map-pin", I_MapPin, "место метка карта"],
  ["calendar", I_Calendar, "календарь дата"],
  ["clock", I_Clock, "часы время"],
  ["mail", I_Mail, "почта письмо"],
  ["phone", I_Phone, "телефон звонок"],
  ["message-circle", I_MessageCircle, "сообщение чат"],
  ["thumbs-up", I_ThumbsUp, "лайк класс"],
  ["smile", I_Smile, "улыбка"],
  ["triangle-alert", I_TriangleAlert, "внимание опасность"],
  ["info", I_Info, "инфо"],
  ["circle-help", I_CircleHelp, "вопрос помощь"],
  ["lock", I_Lock, "замок закрыто"],
  ["key", I_Key, "ключ"],
  ["settings", I_Settings, "настройки шестерёнка"],
  ["search", I_Search, "поиск лупа"],
  ["book", I_Book, "книга"],
  ["bookmark", I_Bookmark, "закладка"],
  ["gift", I_Gift, "подарок"],
  ["coffee", I_Coffee, "кофе"],
  ["pizza", I_Pizza, "пицца еда"],
  ["car", I_Car, "машина"],
  ["plane", I_Plane, "самолёт"],
  ["ship", I_Ship, "корабль"],
  ["bike", I_Bike, "велосипед"],
  ["globe", I_Globe, "глобус мир"],
  ["compass", I_Compass, "компас"],
  ["anchor", I_Anchor, "якорь"],
  ["leaf", I_Leaf, "лист природа"],
  ["tree-pine", I_TreePine, "ёлка дерево"],
  ["flower-2", I_FlowerTwo, "цветок"],
  ["dog", I_Dog, "собака"],
  ["cat", I_Cat, "кошка"],
  ["bird", I_Bird, "птица"],
  ["fish", I_Fish, "рыба"],
  ["bug", I_Bug, "жук ошибка"],
  ["crown", I_Crown, "корона"],
  ["gem", I_Gem, "алмаз камень"],
  ["coins", I_Coins, "монеты деньги"],
  ["wallet", I_Wallet, "кошелёк"],
  ["shopping-cart", I_ShoppingCart, "корзина покупки"],
  ["briefcase", I_Briefcase, "портфель работа"],
  ["graduation-cap", I_GraduationCap, "учёба шапка"],
  ["pencil", I_Pencil, "карандаш"],
  ["palette", I_Palette, "палитра цвет"],
  ["image", I_Image, "картинка"],
  ["film", I_Film, "фильм кино"],
  ["headphones", I_Headphones, "наушники"],
  ["mic", I_Mic, "микрофон"],
  ["gamepad-2", I_GamepadTwo, "игра геймпад"],
  ["puzzle", I_Puzzle, "пазл"],
  ["dice-5", I_DiceFive, "кубик"],
  ["swords", I_Swords, "мечи битва"],
  ["shield", I_Shield, "щит защита"],
  ["skull", I_Skull, "череп"],
  ["ghost", I_Ghost, "призрак"],
  ["wand-sparkles", I_WandSparkles, "магия палочка"],
  ["sparkles", I_Sparkles, "блёстки"],
  ["party-popper", I_PartyPopper, "праздник хлопушка"],
  ["cake", I_Cake, "торт день рождения"],
  ["handshake", I_Handshake, "рукопожатие сделка"],
  ["award", I_Award, "награда"],
  ["medal", I_Medal, "медаль"],
  ["circle-check", I_CircleCheck, "готово круг"],
  ["ban", I_Ban, "запрет"],
  ["arrow-right", I_ArrowRight, "стрелка вправо"],
  ["arrow-up", I_ArrowUp, "стрелка вверх"],
  ["arrow-down", I_ArrowDown, "стрелка вниз"],
  ["arrow-left", I_ArrowLeft, "стрелка влево"],
  ["refresh-cw", I_RefreshCw, "обновить повтор"],
  ["hourglass", I_Hourglass, "песочные часы"],
  ["battery", I_Battery, "батарея"],
  ["wifi", I_Wifi, "сеть"],
  ["code", I_Code, "код"],
  ["terminal", I_Terminal, "терминал"],
  ["database", I_Database, "база данных"],
  ["laptop", I_Laptop, "ноутбук"],
  ["smartphone", I_Smartphone, "смартфон"],
  ["building-2", I_BuildingTwo, "здание офис"],
  ["school", I_School, "школа"],
  ["store", I_Store, "магазин"],
  ["tent", I_Tent, "палатка поход"],
  ["mountain", I_Mountain, "гора"],
  ["waves", I_Waves, "волны море"],
  ["snowflake", I_Snowflake, "снежинка зима"],
  ["umbrella", I_Umbrella, "зонт"],
  ["droplet", I_Droplet, "капля вода"],
  ["thermometer", I_Thermometer, "градусник"],
  ["wind", I_Wind, "ветер"],
];

export const ICONS: { id: string; comp: IconComp; words: string }[] = LIST.map(([id, comp, words]) => ({ id, comp, words }));
const BY_ID = new Map(ICONS.map((x) => [x.id, x.comp]));

export const iconComp = (id: string | undefined): IconComp => BY_ID.get(id ?? "") ?? BY_ID.get("star")!;
export const hasIcon = (id: string | undefined) => !!id && BY_ID.has(id);

export function searchIcons(q: string) {
  const s = q.trim().toLowerCase();
  return s ? ICONS.filter((x) => x.id.includes(s) || x.words.includes(s)) : ICONS;
}
