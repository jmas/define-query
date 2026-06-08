import { memo } from 'react';
import { featureTagCls } from '../styles';

export const FeatureTag = memo(function FeatureTag({ label }: { label: string }) {
  return <span className={featureTagCls}>{label}</span>;
});
