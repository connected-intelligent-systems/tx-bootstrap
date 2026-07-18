import { SimpleFormIterator, FormDataConsumer } from "react-admin";
import { CustomAddButton } from "./CustomAddButton";
import { TractusXPermission } from "./TractusXPermission";

export const PermissionCreate = ({
  ruleType = "permission",
}: {
  ruleType?: "permission" | "prohibition" | "obligation";
}) => {
  const renderPermission = (formData: any) => {
    if (formData?.constraints?.length > 0) {
      return <TractusXPermission ruleType={ruleType} />;
    }

    return (
      <div>
        <p>Select a Tractus-X permission type from the + button above</p>
      </div>
    );
  };

  return (
    <SimpleFormIterator addButton={<CustomAddButton />}>
      <FormDataConsumer>
        {({ scopedFormData }) => {
          return renderPermission(scopedFormData);
        }}
      </FormDataConsumer>
    </SimpleFormIterator>
  );
};
