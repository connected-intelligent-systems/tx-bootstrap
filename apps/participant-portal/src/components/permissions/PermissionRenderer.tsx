import { GenericPermissionShow } from "./GenericPermissionShow";

type PermissionProps = {
  permission: any;
};

export const PermissionRenderer = ({ permission }: PermissionProps) => {
  return <GenericPermissionShow permission={permission} />;
};
