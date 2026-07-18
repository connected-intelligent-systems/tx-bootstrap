import { useInput, useFieldValue } from "react-admin";
import { useTheme } from "@mui/material";
import MDEditor from "@uiw/react-md-editor";
import PropTypes from "prop-types";

type MarkdownInputProps = {
  source: string;
};

type MarkdownFieldProps = {
  source: string;
  record?: Record<string, any>;
};

export const MarkdownInput = ({ source }: MarkdownInputProps) => {
  const { id, field } = useInput({ source });
  const theme = useTheme();
  const colorMode = theme.palette.mode === "dark" ? "dark" : "light";

  return (
    <div id={id} data-color-mode={colorMode} style={{ width: "100%" }}>
      <div className="wmde-markdown-var"> </div>
      <MDEditor {...field} height={500} />
    </div>
  );
};

MarkdownInput.propTypes = {
  source: PropTypes.string,
};

export const MarkdownField = ({ source, record }: MarkdownFieldProps) => {
  const contextValue = useFieldValue({ source });
  const theme = useTheme();
  const colorMode = theme.palette.mode === "dark" ? "dark" : "light";
  const value = record ? record[source] : contextValue;

  if (!value) {
    return <span>-</span>;
  }

  return (
    <div data-color-mode={colorMode} style={{ width: "100%" }}>
      <MDEditor.Markdown source={value} />
    </div>
  );
};

MarkdownField.propTypes = {
  source: PropTypes.string,
  record: PropTypes.object,
};
