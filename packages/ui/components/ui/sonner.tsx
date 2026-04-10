import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return <Sonner {...props} />;
}

export { Toaster, toast };
