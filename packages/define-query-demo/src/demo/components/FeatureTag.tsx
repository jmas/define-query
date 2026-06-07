import { featureTagCls } from '../styles';

export function FeatureTag({ label }: { label: string }) {
  return <span className={featureTagCls}>{label}</span>;
}
