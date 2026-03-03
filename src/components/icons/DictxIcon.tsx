const DictxIcon = ({
  width,
  height,
}: {
  width?: number | string;
  height?: number | string;
}) => (
  <svg
    width={width || 24}
    height={height || 24}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* 9-bar waveform matching the Dictx logo */}
    <rect
      x="1"
      y="9.5"
      width="1.5"
      height="5"
      rx="0.75"
      fill="currentColor"
      opacity="0.6"
    />
    <rect
      x="3.5"
      y="7.5"
      width="1.5"
      height="9"
      rx="0.75"
      fill="currentColor"
      opacity="0.7"
    />
    <rect
      x="6"
      y="5.5"
      width="1.5"
      height="13"
      rx="0.75"
      fill="currentColor"
      opacity="0.8"
    />
    <rect
      x="8.5"
      y="4"
      width="1.5"
      height="16"
      rx="0.75"
      fill="currentColor"
      opacity="0.9"
    />
    <rect
      x="11"
      y="2.5"
      width="1.5"
      height="19"
      rx="0.75"
      fill="currentColor"
    />
    <rect
      x="13.5"
      y="4"
      width="1.5"
      height="16"
      rx="0.75"
      fill="currentColor"
      opacity="0.9"
    />
    <rect
      x="16"
      y="5.5"
      width="1.5"
      height="13"
      rx="0.75"
      fill="currentColor"
      opacity="0.8"
    />
    <rect
      x="18.5"
      y="7.5"
      width="1.5"
      height="9"
      rx="0.75"
      fill="currentColor"
      opacity="0.7"
    />
    <rect
      x="21"
      y="9.5"
      width="1.5"
      height="5"
      rx="0.75"
      fill="currentColor"
      opacity="0.6"
    />
  </svg>
);

export default DictxIcon;
