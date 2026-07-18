import { useState } from "react";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useFieldValue } from "react-admin";
import PropTypes from "prop-types";

type PasswordFieldProps = {
  source: string;
  label?: string;
};

export const PasswordField = ({ source }: PasswordFieldProps) => {
  const value = useFieldValue({ source });
  const [showPassword, setShowPassword] = useState(false);
  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };
  return (
    <TextField
      value={value}
      type={showPassword ? "text" : "password"}
      variant="standard"
      multiline={showPassword}
      slotProps={{
        input: {
          readOnly: true,
          disableUnderline: true,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={handleClickShowPassword}>
                {showPassword ? <Visibility /> : <VisibilityOff />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
};

PasswordField.propTypes = {
  source: PropTypes.string,
};
