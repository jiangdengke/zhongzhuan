export const metadata = {
  title: "智能服务助手",
  description: "提供信息咨询和服务指引的智能服务助手",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
