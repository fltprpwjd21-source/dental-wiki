import type { Metadata } from "next";
import { Noto_Sans_KR, Nanum_Myeongjo } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import "./globals.css";

// 한글 본문용. 300(요약)·400·500·700·900 을 쓴다.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  display: "swap",
});

// 제목·카드 번호용 명조. 800 이 카드 제목의 무게다.
const nanumMyeongjo = Nanum_Myeongjo({
  variable: "--font-nanum-myeongjo",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "치과위키",
  description: "치과 스탭 전용 사내 위키",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${nanumMyeongjo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-l-card">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
