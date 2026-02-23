import VideoRecorder from "~/components/recorder/VideoRecorder";

export default function Record() {
  return (
    <div class="w-full flex flex-col items-center animate-slide-up-in">
      <VideoRecorder />
    </div>
  );
}
