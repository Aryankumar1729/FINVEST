import { RouterProvider } from "react-router";
import { AppProvider } from "../context/AppContext";
import { router } from "./routes";
import { Toaster } from "sonner";

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
      <Toaster position="bottom-left" theme="dark" richColors />
    </AppProvider>
  );
}
