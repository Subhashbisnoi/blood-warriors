import TopBar from '../components/layout/TopBar';

export default function BridgeStatus() {
  return (
    <div className="flex flex-col h-full">
      <TopBar title="KAG Graph — Blood Bridge Network" />
      <div className="flex-1 relative">
        <iframe
          src="/kag-graph.html"
          className="absolute inset-0 w-full h-full border-0"
          title="KAG Graph"
        />
      </div>
    </div>
  );
}
