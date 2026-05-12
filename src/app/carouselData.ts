import desk1 from "../assets/carousel/desktop/carousel1.webp";
import desk2 from "../assets/carousel/desktop/carousel2.webp";
import desk3 from "../assets/carousel/desktop/carousel3.webp";
import desk4 from "../assets/carousel/desktop/carousel4.webp";
import desk5 from "../assets/carousel/desktop/carousel5.webp";
import desk6 from "../assets/carousel/desktop/carousel6.webp";
import desk7 from "../assets/carousel/desktop/carousel7.webp";
import desk8 from "../assets/carousel/desktop/carousel8.webp";
import desk9 from "../assets/carousel/desktop/carousel9.webp";
import desk10 from "../assets/carousel/desktop/carousel10.webp";
import desk11 from "../assets/carousel/desktop/carousel11.webp";
import desk12 from "../assets/carousel/desktop/carousel12.webp";

import mob1 from "../assets/carousel/mobile/carousel1.webp";
import mob2 from "../assets/carousel/mobile/carousel2.webp";
import mob3 from "../assets/carousel/mobile/carousel3.webp";
import mob4 from "../assets/carousel/mobile/carousel4.webp";
import mob5 from "../assets/carousel/mobile/carousel5.webp";
import mob6 from "../assets/carousel/mobile/carousel6.webp";
import mob7 from "../assets/carousel/mobile/carousel7.webp";
import mob8 from "../assets/carousel/mobile/carousel8.webp";
import mob9 from "../assets/carousel/mobile/carousel9.webp";
import mob10 from "../assets/carousel/mobile/carousel10.webp";
import mob11 from "../assets/carousel/mobile/carousel11.webp";
import mob12 from "../assets/carousel/mobile/carousel12.webp";

export interface CarouselSourceRecord {
  id: string;
  desktop: string;
  mobile: string;
}

export const CAROUSEL_SOURCES: CarouselSourceRecord[] = [
  { id: "1", desktop: desk1, mobile: mob1 },
  { id: "2", desktop: desk2, mobile: mob2 },
  { id: "3", desktop: desk3, mobile: mob3 },
  { id: "4", desktop: desk4, mobile: mob4 },
  { id: "5", desktop: desk5, mobile: mob5 },
  { id: "6", desktop: desk6, mobile: mob6 },
  { id: "7", desktop: desk7, mobile: mob7 },
  { id: "8", desktop: desk8, mobile: mob8 },
  { id: "9", desktop: desk9, mobile: mob9 },
  { id: "10", desktop: desk10, mobile: mob10 },
  { id: "11", desktop: desk11, mobile: mob11 },
  { id: "12", desktop: desk12, mobile: mob12 },
];
