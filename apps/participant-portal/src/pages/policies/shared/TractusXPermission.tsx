import { useEffect, useState } from 'react'
import {
  ArrayInput,
  FormDataConsumer,
  SelectInput,
  SimpleFormIterator,
  TextInput,
  BooleanInput,
  NumberInput,
  DateInput,
  required,
  useInput,
  useTranslate,
} from 'react-admin'
import { Box, Button, Typography } from '@mui/material'
import GroupsIcon from '@mui/icons-material/Groups'
import {
  getTractusXActionChoices,
  getTractusXConstraint,
  getTractusXConstraintChoices,
  type TractusXAction,
  type TractusXRuleType,
} from './tractusxPolicyMetadata'
import { BusinessPartnerGroupsDialog } from './BusinessPartnerGroupsDialog'

const listOperators = ['isAnyOf', 'isAllOf', 'isNoneOf', 'isPartOf']

const operatorChoices = (leftOperand?: string) => {
  const constraint = getTractusXConstraint(leftOperand)
  return (constraint?.operators || ['eq', 'neq', ...listOperators]).map((operator) => ({
    id: operator,
    name: operator,
  }))
}

const usesListValue = (operator?: string) => listOperators.includes(operator || '')

const appendCurrentChoice = (choices: Array<{ id: string; name: string }>, current?: string) => {
  if (!current || choices.some((choice) => choice.id === current)) {
    return choices
  }

  return [...choices, { id: current, name: getTractusXConstraint(current)?.label || current }]
}

const RightOperandInput = ({ scopedFormData }: any) => {
  const translate = useTranslate()
  const leftOperand = scopedFormData?.leftOperand
  const operator = scopedFormData?.operator
  const constraint = getTractusXConstraint(leftOperand)
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false)

  if (usesListValue(operator)) {
    return (
      <Box>
        <ArrayInput source="rightOperand" label={translate('resources.policies.create.permissions.values')}>
          <SimpleFormIterator inline>
            <TextInput
              source=""
              label={translate('resources.policies.create.permissions.value')}
              validate={[required()]}
            />
          </SimpleFormIterator>
        </ArrayInput>
        {leftOperand === 'BusinessPartnerGroup' && (
          <>
            <Button size="small" startIcon={<GroupsIcon />} onClick={() => setGroupsDialogOpen(true)}>
              {translate('resources.policies.groupsDialog.manageButton')}
            </Button>
            <BusinessPartnerGroupsDialog open={groupsDialogOpen} onClose={() => setGroupsDialogOpen(false)} />
          </>
        )}
      </Box>
    )
  }

  if (constraint?.valueType === 'number') {
    return (
      <NumberInput
        source="rightOperand"
        label={translate('resources.policies.create.permissions.value')}
        validate={[required()]}
      />
    )
  }

  if (constraint?.valueType === 'date') {
    return (
      <DateInput
        source="rightOperand"
        label={translate('resources.policies.create.permissions.value')}
        validate={[required()]}
      />
    )
  }

  if (constraint?.valueType === 'boolean') {
    return <BooleanInput source="rightOperand" label={translate('resources.policies.create.permissions.value')} />
  }

  return (
    <TextInput
      source="rightOperand"
      label={translate('resources.policies.create.permissions.value')}
      validate={[required()]}
      fullWidth
    />
  )
}

export const TractusXPermission = ({ ruleType = 'permission' }: { ruleType?: TractusXRuleType }) => {
  const translate = useTranslate()
  const {
    field: { value: constraints = [] },
  } = useInput({ source: 'constraints' })
  const {
    field: { value: action, onChange: setAction },
  } = useInput({ source: 'action' })

  useEffect(() => {
    if (!action && constraints[0]?.leftOperand) {
      setAction(getTractusXConstraint(constraints[0].leftOperand)?.defaultAction || 'use')
    }
  }, [action, constraints, setAction])

  const actionChoices = appendCurrentChoice(getTractusXActionChoices(ruleType), action)

  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ mb: 1 }}>{translate('resources.policies.create.permissions.tractusxPermission')}</Typography>
      <SelectInput
        source="action"
        label={translate('resources.policies.create.permissions.action')}
        choices={actionChoices}
        validate={[required()]}
      />
      <ArrayInput source="constraints" label={translate('resources.policies.create.permissions.constraints')}>
        <SimpleFormIterator inline>
          <FormDataConsumer>
            {({ scopedFormData }) => {
              const leftOperand = scopedFormData?.leftOperand
              const constraintChoices = appendCurrentChoice(
                getTractusXConstraintChoices(ruleType, action as TractusXAction),
                leftOperand,
              )

              return (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    minWidth: 360,
                  }}
                >
                  <SelectInput
                    source="leftOperand"
                    label={translate('resources.policies.create.permissions.leftOperand')}
                    choices={constraintChoices}
                    validate={[required()]}
                    onChange={(eventOrValue: any) => {
                      const value = eventOrValue?.target?.value || eventOrValue
                      const definition = getTractusXConstraint(value)
                      if (definition) {
                        const nextAction = definition.actions.includes(action) ? action : definition.defaultAction
                        setAction(nextAction)
                      }
                    }}
                  />
                  <SelectInput
                    source="operator"
                    label={translate('resources.policies.create.permissions.operator')}
                    choices={operatorChoices(leftOperand)}
                    validate={[required()]}
                  />
                  <RightOperandInput scopedFormData={scopedFormData} />
                </Box>
              )
            }}
          </FormDataConsumer>
        </SimpleFormIterator>
      </ArrayInput>
    </Box>
  )
}
