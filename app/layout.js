export const metadata = {
  title: "机场智能服务助手",
  description: "提供航班查询、路线指引和天气信息的智能服务助手",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
