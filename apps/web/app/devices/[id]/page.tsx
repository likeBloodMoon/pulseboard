import DeviceClient from "./DeviceClient";

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeviceClient deviceId={id} />;
}

